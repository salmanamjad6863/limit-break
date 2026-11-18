import { exerciseById } from '@lb/content';
import type {
  EditWorkoutInput, EditWorkoutResponse, FinishWorkoutInput, FinishWorkoutResponse, ManualWorkoutInput, WorkoutDetailDto, WorkoutSummaryDto,
} from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import { computeWorkoutRewards, gameDate, levelFromXp, rpeZone, type FinishedSet } from '@lb/engine';
import { apForLevelUp } from '../progression/ap';
import { recomputeStats } from '../progression/service';
import { isUniqueViolation } from '../../lib/db';
import { onWeeklyXp } from '../social/hooks';

export class WorkoutError extends Error {
  constructor(public status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

/** Logs stay editable for 7 days, then lock for rewards (leaderboard integrity, SYSTEMS.md §3.11). */
export const EDIT_WINDOW_DAYS = 7;
const DAY = 86_400_000;
const shiftIso = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);

/** SYSTEMS.md §4.8 — sets that fail plausibility are stored but earn nothing. */
export function isPlausibleSet(s: FinishWorkoutInput['sets'][number], bodyweightKg: number): boolean {
  const ex = exerciseById.get(s.exerciseId);
  if (!ex) return false;
  if (ex.kind === 'reps' && (s.reps ?? 0) > 100) return false;
  if ((s.weightKg ?? 0) > bodyweightKg * 4) return false;
  return true;
}

/** Clock skew we tolerate on client timestamps. */
const FUTURE_SLACK_MS = 5 * 60_000;
/** Longer sessions are almost always a forgotten Finish: the duration is clamped (minutes shown in history). */
export const MAX_SESSION_MS = 6 * 3_600_000;

/**
 * finishedAt decides the game day (and so the daily XP cap): it must be real. Rejects the future, finishing
 * before starting, and anything older than the edit window; clamps absurd durations.
 */
export function checkFinishTimes(input: { startedAt: string; finishedAt: string }, now = new Date()): { startedAt: Date; finishedAt: Date } {
  const finishedAt = new Date(input.finishedAt);
  let startedAt = new Date(input.startedAt);
  if (finishedAt.getTime() > now.getTime() + FUTURE_SLACK_MS) throw new WorkoutError(400, 'finishedAt is in the future; check the phone clock');
  if (finishedAt.getTime() < startedAt.getTime()) throw new WorkoutError(400, 'finishedAt is before startedAt');
  if (finishedAt.getTime() < now.getTime() - EDIT_WINDOW_DAYS * DAY) throw new WorkoutError(400, `workouts older than ${EDIT_WINDOW_DAYS} days can't be logged`);
  if (finishedAt.getTime() - startedAt.getTime() > MAX_SESSION_MS) startedAt = new Date(finishedAt.getTime() - MAX_SESSION_MS);
  return { startedAt, finishedAt };
}

/**
 * Server-authoritative workout finish (ARCHITECTURE.md §7): idempotent by workout id.
 * Persists the session + sets, computes XP/PRs/level with the shared engine, writes the ledger.
 */
export async function finishWorkout(prisma: PrismaClient, userId: string, input: FinishWorkoutInput): Promise<FinishWorkoutResponse> {
  try {
    const res = await finishWorkoutTx(prisma, userId, input);
    // a fresh finish that earned XP feeds this week's duels, raid and league (best-effort, never fails the workout)
    if (!res.duplicate && res.granted > 0) {
      const row = await prisma.workoutSession.findUnique({ where: { id: input.id }, select: { localDate: true } });
      if (row) await onWeeklyXp(prisma, userId, row.localDate, res.granted);
    }
    return res;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // a concurrent retry of the same finish won the race: answer with its result
    const existing = await prisma.event.findUnique({ where: { id: input.id } });
    if (existing?.userId === userId) return { ...(existing.payload as unknown as FinishWorkoutResponse), duplicate: true };
    throw new WorkoutError(409, 'workout id already used');
  }
}

/** Remote Supabase (Tokyo) + recomputeStats regularly needs more than Prisma's 5 s default. */
const TX = { maxWait: 10_000, timeout: 20_000 } as const;

async function finishWorkoutTx(prisma: PrismaClient, userId: string, input: FinishWorkoutInput): Promise<FinishWorkoutResponse> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.event.findUnique({ where: { id: input.id } });
    if (existing && existing.userId !== userId) throw new WorkoutError(409, 'workout id already used');
    if (existing) return { ...(existing.payload as unknown as FinishWorkoutResponse), duplicate: true };
    const times = checkFinishTimes(input);

    const profile = await tx.profile.findUnique({ where: { id: userId }, select: { timezone: true } });
    const state = await tx.hunterState.findUnique({ where: { userId } });
    if (!profile || !state) throw new Error('profile not onboarded');
    const weight = await tx.bodyMetric.findFirst({
      where: { userId, weightKg: { not: null } }, orderBy: { measuredAt: 'desc' }, select: { weightKg: true },
    });
    const bodyweightKg = weight?.weightKg ?? 75;
    const localDate = gameDate(times.finishedAt, profile.timezone);

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

    const ap = apForLevelUp(state, r.levelTo);
    const rewards = r.rewards.map((x) => (x.type === 'levelUp' ? { ...x, ap: ap.ap } : x));
    const response: FinishWorkoutResponse = {
      workoutId: input.id, granted: r.granted, totalXp: r.newXp, level: r.levelTo, prs: r.prs, rewards, duplicate: false,
    };

    await tx.workoutSession.create({
      data: {
        id: input.id, userId, plannedWorkoutId: input.plannedWorkoutId, localDate,
        startedAt: times.startedAt, finishedAt: times.finishedAt, plannedHardSets: input.plannedHardSets,
        cardioMinutes: input.cardio.reduce((m, c) => m + c.minutes, 0),
        cardio: input.cardio.length ? (input.cardio.map((c) => ({ minutes: c.minutes, rpe: c.rpe })) as never) : undefined,
        kind: input.kind, source: 'app', name: input.name, notes: input.notes, programId: input.programId, dayId: input.dayId,
        sessionRpe: input.sessionRpe, xpGranted: r.granted,
      },
    });
    if (input.sets.length) {
      await tx.workoutSet.createMany({
        data: input.sets.map((s) => ({
          id: s.id, sessionId: input.id, exerciseId: s.exerciseId, order: s.order, reps: s.reps, weightKg: s.weightKg,
          rir: s.rir, rpe: s.rpe, durationS: s.durationS, distanceM: s.distanceM, isWarmup: s.isWarmup, setType: s.setType,
          completedAt: new Date(s.completedAt),
        })),
      });
    }
    await tx.event.create({
      data: {
        id: input.id, userId, type: 'workout.finished', localDate, clientTs: times.finishedAt,
        payload: response as never, flagged: plausible.length !== input.sets.length,
      },
    });
    if (r.granted > 0) await tx.xpLedger.create({ data: { eventId: input.id, userId, localDate, amount: r.granted, reason: 'workout' } });

    const improved = Object.entries(r.bestE1rm).filter(([id, v]) => v > (bestE1rm[id] ?? 0));
    if (improved.length) {
      await tx.personalRecord.createMany({
        data: improved.map(([exerciseId, e1rmKg]) => ({
          userId, exerciseId, e1rmKg, setId: input.sets.find((s) => s.exerciseId === exerciseId)!.id, achievedAt: times.finishedAt,
        })),
      });
    }
    await tx.hunterState.update({
      where: { userId },
      data: { xp: r.newXp, level: r.levelTo, ...ap.data },
    });
    await recomputeStats(tx, userId);
    return response;
  }, TX);
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
type SessionRow = Awaited<ReturnType<PrismaClient['workoutSession']['findMany']>>[number] & {
  sets: Awaited<ReturnType<PrismaClient['workoutSet']['findMany']>>;
};

async function bodyweight(tx: Tx, userId: string) {
  const w = await tx.bodyMetric.findFirst({ where: { userId, weightKg: { not: null } }, orderBy: { measuredAt: 'desc' }, select: { weightKg: true } });
  return w?.weightKg ?? 75;
}

const toFinished = (sets: readonly FinishWorkoutInput['sets'][number][]): FinishedSet[] =>
  sets.map((s) => {
    const ex = exerciseById.get(s.exerciseId)!;
    return { exerciseId: s.exerciseId, reps: s.reps, loadKg: s.weightKg, rir: s.rir, durationS: s.durationS, isWarmup: s.isWarmup, bwFactor: ex.bwFactor, kind: ex.kind };
  });

function summarize(s: SessionRow, prs: { exerciseId: string; e1rmKg: number }[]): WorkoutSummaryDto {
  const working = s.sets.filter((x) => !x.isWarmup);
  const end = s.finishedAt ?? s.startedAt;
  return {
    id: s.id, date: s.localDate, name: s.name ?? (s.kind === 'quick' ? 'Quick session' : 'Workout'), kind: s.kind as WorkoutSummaryDto['kind'],
    source: s.source as WorkoutSummaryDto['source'],
    minutes: s.kind === 'manual' ? s.cardioMinutes : Math.max(1, Math.round((end.getTime() - s.startedAt.getTime()) / 60000)),
    workingSets: working.length, volumeKg: Math.round(working.reduce((v, x) => v + (x.weightKg ?? 0) * (x.reps ?? 0), 0)),
    xp: s.xpGranted, prs, notes: s.notes, editableUntil: shiftIso(s.localDate, EDIT_WINDOW_DAYS),
    programId: s.programId ?? null, dayId: s.dayId ?? null,
  };
}

async function prsFor(prisma: PrismaClient | Tx, userId: string, setIds: string[]) {
  if (!setIds.length) return new Map<string, { exerciseId: string; e1rmKg: number }[]>();
  const rows = await prisma.personalRecord.findMany({ where: { userId, setId: { in: setIds } }, select: { exerciseId: true, e1rmKg: true, setId: true } });
  const out = new Map<string, { exerciseId: string; e1rmKg: number }[]>();
  for (const r of rows) {
    const list = out.get(r.setId!) ?? [];
    list.push({ exerciseId: r.exerciseId, e1rmKg: Math.round(r.e1rmKg * 10) / 10 });
    out.set(r.setId!, list);
  }
  return out;
}

/** History list, newest first (cursor = the oldest date already shown). */
export async function listWorkouts(prisma: PrismaClient, userId: string, before?: string, limit = 30): Promise<WorkoutSummaryDto[]> {
  const rows = (await prisma.workoutSession.findMany({
    where: { userId, ...(before ? { localDate: { lt: before } } : {}) },
    orderBy: [{ localDate: 'desc' }, { startedAt: 'desc' }], take: limit, include: { sets: true },
  })) as SessionRow[];
  const prs = await prsFor(prisma, userId, rows.flatMap((r) => r.sets.map((x) => x.id)));
  return rows.map((r) => summarize(r, r.sets.flatMap((x) => prs.get(x.id) ?? [])));
}

async function ownSession(prisma: PrismaClient | Tx, userId: string, id: string): Promise<SessionRow> {
  const s = (await prisma.workoutSession.findUnique({ where: { id }, include: { sets: true } })) as SessionRow | null;
  if (!s || s.userId !== userId) throw new WorkoutError(404, 'workout not found');
  return s;
}

export async function getWorkout(prisma: PrismaClient, userId: string, id: string): Promise<WorkoutDetailDto> {
  const s = await ownSession(prisma, userId, id);
  const prs = await prsFor(prisma, userId, s.sets.map((x) => x.id));
  return {
    ...summarize(s, s.sets.flatMap((x) => prs.get(x.id) ?? [])),
    sessionRpe: s.sessionRpe,
    sets: [...s.sets].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.order - b.order).map((x) => ({
      id: x.id, exerciseId: x.exerciseId, order: x.order, reps: x.reps, weightKg: x.weightKg, rir: x.rir, rpe: x.rpe, durationS: x.durationS,
      distanceM: x.distanceM, isWarmup: x.isWarmup, setType: x.setType as 'normal' | 'drop' | 'failure', completedAt: x.completedAt.toISOString(),
    })),
  };
}

async function assertEditable(tx: Tx, userId: string, s: SessionRow) {
  const p = await tx.profile.findUnique({ where: { id: userId }, select: { timezone: true } });
  const today = gameDate(new Date(), p?.timezone ?? 'UTC');
  if (today > shiftIso(s.localDate, EDIT_WINDOW_DAYS)) throw new WorkoutError(409, 'workouts lock 7 days after the session');
}

/**
 * Applies an XP change for a workout as a diff (never re-grants): ledger row ±delta,
 * HunterState xp/level. AP already granted is kept if the level drops (no clawback of spent points),
 * and climbing back to a level already paid for grants nothing.
 */
async function applyDelta(tx: Tx, i: { userId: string; eventId: string; localDate: string; delta: number; reason: string; payload: unknown }) {
  const state = await tx.hunterState.findUnique({ where: { userId: i.userId } });
  if (!state) throw new WorkoutError(409, 'profile not onboarded');
  await tx.event.create({ data: { id: i.eventId, userId: i.userId, type: i.reason, localDate: i.localDate, clientTs: new Date(), payload: i.payload as never } });
  if (i.delta !== 0) await tx.xpLedger.create({ data: { eventId: i.eventId, userId: i.userId, localDate: i.localDate, amount: i.delta, reason: i.reason } });
  const xp = Math.max(0, state.xp + i.delta);
  const to = levelFromXp(xp);
  // AP only for levels never reached before: no farming by editing down and back up (or delete + re-finish)
  await tx.hunterState.update({ where: { userId: i.userId }, data: { xp, level: to, ...apForLevelUp(state, to).data } });
  return { totalXp: xp, level: to };
}

/** The cardio entries as finished (same XP as finish); older rows without them fall back to total minutes × session RPE. */
function cardioOf(s: SessionRow, sessionRpe: number | null) {
  const stored = (s as { cardio?: unknown }).cardio;
  if (Array.isArray(stored)) {
    return (stored as { minutes: number; rpe: number }[]).filter((c) => typeof c?.minutes === 'number' && typeof c?.rpe === 'number').map((c) => ({ minutes: c.minutes, zone: rpeZone(c.rpe) }));
  }
  return s.cardioMinutes > 0 ? [{ minutes: s.cardioMinutes, zone: rpeZone(sessionRpe ?? s.sessionRpe ?? 7) }] : [];
}

/** Best e1RM per exercise, ignoring the PRs this workout itself set (so edits can lower them). */
async function bestExcluding(tx: Tx, userId: string, setIds: string[]) {
  const records = await tx.personalRecord.findMany({ where: { userId }, select: { exerciseId: true, e1rmKg: true, setId: true } });
  const best: Record<string, number> = {};
  for (const r of records) if (!r.setId || !setIds.includes(r.setId)) best[r.exerciseId] = Math.max(best[r.exerciseId] ?? 0, r.e1rmKg);
  return best;
}

export async function editWorkout(prisma: PrismaClient, userId: string, id: string, input: EditWorkoutInput): Promise<EditWorkoutResponse> {
  return prisma.$transaction(async (tx) => {
    const done = await tx.event.findUnique({ where: { id: input.editId } });
    if (done) return done.payload as unknown as EditWorkoutResponse;
    const s = await ownSession(tx, userId, id);
    if (s.kind === 'manual') throw new WorkoutError(400, 'manual logs have no sets; delete and log again');
    await assertEditable(tx, userId, s);
    for (const x of input.sets) if (!exerciseById.has(x.exerciseId)) throw new WorkoutError(400, `unknown exercise ${x.exerciseId}`);

    const oldIds = s.sets.map((x) => x.id);
    const bw = await bodyweight(tx, userId);
    const best = await bestExcluding(tx, userId, oldIds);
    const day = await tx.xpLedger.aggregate({ where: { userId, localDate: s.localDate }, _sum: { amount: true } });
    const state = await tx.hunterState.findUnique({ where: { userId } });
    const plausible = input.sets.filter((x) => isPlausibleSet(x, bw));
    const r = computeWorkoutRewards({
      sets: toFinished(plausible), plannedHardSets: s.plannedHardSets,
      cardio: cardioOf(s, input.sessionRpe),
      bestE1rm: best, bodyweightKg: bw, xpEarnedToday: (day._sum.amount ?? 0) - s.xpGranted, currentXp: (state?.xp ?? 0) - s.xpGranted,
    });
    const delta = r.granted - s.xpGranted;

    await tx.personalRecord.deleteMany({ where: { userId, setId: { in: oldIds } } });
    await tx.workoutSet.deleteMany({ where: { sessionId: id } });
    if (input.sets.length) {
      await tx.workoutSet.createMany({
        data: input.sets.map((x) => ({
          id: x.id, sessionId: id, exerciseId: x.exerciseId, order: x.order, reps: x.reps, weightKg: x.weightKg, rir: x.rir, rpe: x.rpe,
          durationS: x.durationS, distanceM: x.distanceM, isWarmup: x.isWarmup, setType: x.setType, completedAt: new Date(x.completedAt),
        })),
      });
    }
    // same rule as finish: first-time bests are stored too (baselines), true PRs come back in r.prs
    const improved = Object.entries(r.bestE1rm).filter(([ex, v]) => v > (best[ex] ?? 0));
    if (improved.length) {
      await tx.personalRecord.createMany({
        data: improved.map(([exerciseId, e1rmKg]) => ({ userId, exerciseId, e1rmKg, setId: input.sets.find((x) => x.exerciseId === exerciseId)!.id, achievedAt: s.finishedAt ?? s.startedAt })),
      });
    }
    await tx.workoutSession.update({ where: { id }, data: { xpGranted: r.granted, notes: input.notes, sessionRpe: input.sessionRpe, editedAt: new Date() } });
    const totals = await applyDelta(tx, { userId, eventId: input.editId, localDate: s.localDate, delta, reason: 'workout:edit', payload: { workoutId: id, delta } });
    const response: EditWorkoutResponse = { xp: r.granted, delta, ...totals };
    await tx.event.update({ where: { id: input.editId }, data: { payload: response as never } });
    await recomputeStats(tx, userId);
    return response;
  }, TX);
}

export async function deleteWorkout(prisma: PrismaClient, userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const s = await ownSession(tx, userId, id);
    await assertEditable(tx, userId, s);
    await tx.personalRecord.deleteMany({ where: { userId, setId: { in: s.sets.map((x) => x.id) } } });
    await tx.workoutSession.delete({ where: { id } });
    const totals = await applyDelta(tx, { userId, eventId: crypto.randomUUID(), localDate: s.localDate, delta: -s.xpGranted, reason: 'workout:delete', payload: { workoutId: id } });
    await recomputeStats(tx, userId);
    return { removedXp: s.xpGranted, ...totals };
  }, TX);
}

/** Training done without the app: real-minutes XP (§4.1), unverified (excluded from leaderboards: ledger reason "manual"). */
export async function logManual(prisma: PrismaClient, userId: string, input: ManualWorkoutInput) {
  return prisma.$transaction(async (tx) => {
    const done = await tx.event.findUnique({ where: { id: input.id } });
    if (done) return done.payload as unknown as { workoutId: string; granted: number; totalXp: number; level: number };
    const p = await tx.profile.findUnique({ where: { id: userId }, select: { timezone: true } });
    const today = gameDate(new Date(), p?.timezone ?? 'UTC');
    if (input.localDate > today || input.localDate < shiftIso(today, -EDIT_WINDOW_DAYS)) throw new WorkoutError(400, 'manual logs are for the last 7 days');
    const state = await tx.hunterState.findUnique({ where: { userId } });
    if (!state) throw new WorkoutError(409, 'profile not onboarded');
    const day = await tx.xpLedger.aggregate({ where: { userId, localDate: input.localDate }, _sum: { amount: true } });
    const r = computeWorkoutRewards({
      sets: [], plannedHardSets: 0, cardio: [{ minutes: input.minutes, zone: rpeZone(input.rpe) }],
      bestE1rm: {}, bodyweightKg: 75, xpEarnedToday: day._sum.amount ?? 0, currentXp: state.xp,
    });
    const at = new Date(`${input.localDate}T12:00:00Z`);
    await tx.workoutSession.create({
      data: {
        id: input.id, userId, localDate: input.localDate, startedAt: at, finishedAt: new Date(at.getTime() + input.minutes * 60000),
        kind: 'manual', source: 'manual', name: input.name, notes: input.notes, cardioMinutes: input.minutes, sessionRpe: input.rpe, xpGranted: r.granted,
      },
    });
    const totals = await applyDelta(tx, { userId, eventId: input.id, localDate: input.localDate, delta: r.granted, reason: 'manual', payload: {} });
    const response = { workoutId: input.id, granted: r.granted, ...totals };
    await tx.event.update({ where: { id: input.id }, data: { payload: response as never } });
    return response;
  }, TX);
}

export async function getNotes(prisma: PrismaClient, userId: string) {
  const rows = await prisma.exerciseNote.findMany({ where: { userId } });
  return { notes: Object.fromEntries(rows.map((r) => [r.exerciseId, r.note])) };
}

export async function setNote(prisma: PrismaClient, userId: string, exerciseId: string, note: string) {
  if (!exerciseById.has(exerciseId)) throw new WorkoutError(400, 'unknown exercise');
  if (!note.trim()) await prisma.exerciseNote.deleteMany({ where: { userId, exerciseId } });
  else await prisma.exerciseNote.upsert({ where: { userId_exerciseId: { userId, exerciseId } }, create: { userId, exerciseId, note: note.trim() }, update: { note: note.trim() } });
  return { ok: true };
}
