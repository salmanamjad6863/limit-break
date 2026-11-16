import { exerciseById } from '@lb/content';
import type { FinishWorkoutInput, FinishWorkoutResponse } from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import { computeWorkoutRewards, gameDate, rpeZone, type FinishedSet } from '@lb/engine';

/** SYSTEMS.md §4.8 — sets that fail plausibility are stored but earn nothing. */
export function isPlausibleSet(s: FinishWorkoutInput['sets'][number], bodyweightKg: number): boolean {
  const ex = exerciseById.get(s.exerciseId);
  if (!ex) return false;
  if (ex.kind === 'reps' && (s.reps ?? 0) > 100) return false;
  if ((s.weightKg ?? 0) > bodyweightKg * 4) return false;
  return true;
}

/**
 * Server-authoritative workout finish (ARCHITECTURE.md §7): idempotent by workout id.
 * Persists the session + sets, computes XP/PRs/level with the shared engine, writes the ledger.
 */
export async function finishWorkout(prisma: PrismaClient, userId: string, input: FinishWorkoutInput): Promise<FinishWorkoutResponse> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.event.findUnique({ where: { id: input.id } });
    if (existing) return { ...(existing.payload as unknown as FinishWorkoutResponse), duplicate: true };

    const profile = await tx.profile.findUnique({ where: { id: userId }, select: { timezone: true } });
    const state = await tx.hunterState.findUnique({ where: { userId } });
    if (!profile || !state) throw new Error('profile not onboarded');
    const weight = await tx.bodyMetric.findFirst({
      where: { userId, weightKg: { not: null } }, orderBy: { measuredAt: 'desc' }, select: { weightKg: true },
    });
    const bodyweightKg = weight?.weightKg ?? 75;
    const localDate = gameDate(new Date(input.finishedAt), profile.timezone);

    const records = await tx.personalRecord.findMany({ where: { userId }, select: { exerciseId: true, e1rmKg: true } });
    const bestE1rm: Record<string, number> = {};
    for (const r of records) bestE1rm[r.exerciseId] = Math.max(bestE1rm[r.exerciseId] ?? 0, r.e1rmKg);

    const today = await tx.xpLedger.aggregate({ where: { userId, localDate }, _sum: { amount: true } });

    const plausible = input.sets.filter((s) => isPlausibleSet(s, bodyweightKg));
    const finished: FinishedSet[] = plausible.map((s) => {
      const ex = exerciseById.get(s.exerciseId)!;
      return {
        exerciseId: s.exerciseId, reps: s.reps, loadKg: s.weightKg, rir: s.rir, durationS: s.durationS,
        isWarmup: s.isWarmup, bwFactor: ex.bwFactor, kind: ex.kind,
      };
    });

    const r = computeWorkoutRewards({
      sets: finished,
      plannedHardSets: input.plannedHardSets,
      cardio: input.cardio.map((c) => ({ minutes: c.minutes, zone: rpeZone(c.rpe) })),
      bestE1rm,
      bodyweightKg,
      xpEarnedToday: today._sum.amount ?? 0,
      currentXp: state.xp,
    });

    const response: FinishWorkoutResponse = {
      workoutId: input.id, granted: r.granted, totalXp: r.newXp, level: r.levelTo, prs: r.prs, rewards: r.rewards, duplicate: false,
    };

    await tx.workoutSession.create({
      data: {
        id: input.id, userId, plannedWorkoutId: input.plannedWorkoutId, localDate,
        startedAt: new Date(input.startedAt), finishedAt: new Date(input.finishedAt), plannedHardSets: input.plannedHardSets,
      },
    });
    if (input.sets.length) {
      await tx.workoutSet.createMany({
        data: input.sets.map((s) => ({
          id: s.id, sessionId: input.id, exerciseId: s.exerciseId, order: s.order, reps: s.reps, weightKg: s.weightKg,
          rir: s.rir, rpe: s.rpe, durationS: s.durationS, distanceM: s.distanceM, isWarmup: s.isWarmup, completedAt: new Date(s.completedAt),
        })),
      });
    }
    await tx.event.create({
      data: {
        id: input.id, userId, type: 'workout.finished', localDate, clientTs: new Date(input.finishedAt),
        payload: response as never, flagged: plausible.length !== input.sets.length,
      },
    });
    if (r.granted > 0) await tx.xpLedger.create({ data: { eventId: input.id, userId, localDate, amount: r.granted, reason: 'workout' } });

    const improved = Object.entries(r.bestE1rm).filter(([id, v]) => v > (bestE1rm[id] ?? 0));
    if (improved.length) {
      await tx.personalRecord.createMany({
        data: improved.map(([exerciseId, e1rmKg]) => ({
          userId, exerciseId, e1rmKg, setId: input.sets.find((s) => s.exerciseId === exerciseId)!.id, achievedAt: new Date(input.finishedAt),
        })),
      });
    }
    await tx.hunterState.update({
      where: { userId },
      data: { xp: r.newXp, level: r.levelTo, apUnspent: { increment: r.apGained } },
    });
    return response;
  });
}
