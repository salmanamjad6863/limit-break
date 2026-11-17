import { assessmentNorms, exercises } from '@lb/content';
import type { FitnessTests, ProgressionResponse, TrialAttemptInput, TrialAttemptResponse } from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import { computeTrueStats, evaluateTrial, gameDate, RANK_REQUIREMENTS, scoreTrialEvents, trialStatus, XP, type HeroClass, type Rank } from '@lb/engine';
import { grantXp } from './xp';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

const DAY = 86_400_000;
/** Calisthenics chains from content: exercise id → 1-based level in its chain. */
const CHAINS = exercises
  .filter((e) => e.progression)
  .map((e) => e.progression!.split('>'));

export const ageFrom = (birth: Date | null | undefined, now = new Date()) =>
  birth ? Math.max(13, Math.floor((now.getTime() - birth.getTime()) / (365.25 * DAY))) : 30;

/** Latest value per test: trial attempts (newest first) override the onboarding assessment. */
export function mergeTests(baselines: unknown, attempts: readonly { results: unknown }[]): FitnessTests {
  const out: FitnessTests = { ...((baselines as FitnessTests) ?? {}) };
  for (const a of [...attempts].reverse()) {
    for (const [k, v] of Object.entries((a.results ?? {}) as FitnessTests)) if (v != null) (out as Record<string, number>)[k] = v;
  }
  return out;
}

/** Recomputes True Stats from the DB and writes them to HunterState (SYSTEMS.md §4.3). */
export async function recomputeStats(tx: Tx, userId: string, now = new Date()) {
  const profile = await tx.profile.findUnique({ where: { id: userId } });
  if (!profile) return null;
  const since90 = new Date(now.getTime() - 90 * DAY);
  const since28 = new Date(now.getTime() - 28 * DAY);
  const [weight, records, attempts, recentSets, hardSets28, sessions28, lastSession] = await Promise.all([
    tx.bodyMetric.findFirst({ where: { userId, weightKg: { not: null } }, orderBy: { measuredAt: 'desc' }, select: { weightKg: true } }),
    tx.personalRecord.findMany({ where: { userId }, select: { exerciseId: true, e1rmKg: true } }),
    tx.trialAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { results: true, createdAt: true } }),
    tx.workoutSet.findMany({ where: { session: { userId, startedAt: { gte: since90 } }, isWarmup: false, reps: { gte: 5 } }, select: { exerciseId: true } }),
    tx.workoutSet.count({ where: { session: { userId, startedAt: { gte: since28 } }, isWarmup: false } }),
    tx.workoutSession.count({ where: { userId, startedAt: { gte: since28 } } }),
    tx.workoutSession.findFirst({ where: { userId }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
  ]);
  const bestE1rm: Record<string, number> = {};
  for (const r of records) bestE1rm[r.exerciseId] = Math.max(bestE1rm[r.exerciseId] ?? 0, r.e1rmKg);
  const done = new Set(recentSets.map((s) => s.exerciseId));
  const calisthenicsLevels = CHAINS.map((chain) => chain.reduce((lvl, id, i) => (done.has(id) ? i + 1 : lvl), 0)).filter((l) => l > 0);
  const lastData = Math.max(lastSession?.startedAt.getTime() ?? 0, attempts[0]?.createdAt.getTime() ?? 0, profile.onboardedAt?.getTime() ?? 0);

  const result = computeTrueStats(
    {
      sex: (profile.sex ?? 'unspecified') as 'male' | 'female' | 'unspecified',
      ageYears: ageFrom(profile.birthDate, now),
      bodyweightKg: weight?.weightKg ?? 75,
      experience: (profile.experience ?? 'beginner') as 'beginner',
      tests: mergeTests(profile.baselines, attempts),
      bestE1rm,
      calisthenicsLevels,
      weeklyHardSets4w: hardSets28 / 4,
      sessionsDone28: sessions28,
      sessionsPlanned28: (profile.daysPerWeek ?? 3) * 4,
      weeksSinceData: lastData ? Math.max(0, (now.getTime() - lastData) / (7 * DAY)) : 0,
    },
    assessmentNorms,
  );
  await tx.hunterState.update({
    where: { userId },
    data: { str: result.stats.STR, agi: result.stats.AGI, end: result.stats.END, vit: result.stats.VIT, spi: result.stats.SPI },
  });
  return result;
}

export async function getProgression(prisma: PrismaClient, userId: string): Promise<ProgressionResponse> {
  const now = new Date();
  const [state, attempts, ledger, prs] = await Promise.all([
    prisma.hunterState.findUnique({ where: { userId } }),
    prisma.trialAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.xpLedger.findMany({ where: { userId, createdAt: { gte: new Date(now.getTime() - 14 * DAY) } }, select: { localDate: true, amount: true } }),
    prisma.personalRecord.findMany({ where: { userId }, orderBy: { e1rmKg: 'desc' }, take: 50 }),
  ]);
  const breakdown = await prisma.$transaction((tx) => recomputeStats(tx, userId, now));
  if (!state || !breakdown) throw new Error('profile not onboarded');
  const byDay = new Map<string, number>();
  for (const l of ledger) byDay.set(l.localDate, (byDay.get(l.localDate) ?? 0) + l.amount);
  const bestPr = new Map<string, (typeof prs)[number]>();
  for (const p of prs) if (!bestPr.has(p.exerciseId)) bestPr.set(p.exerciseId, p);
  return {
    stats: breakdown.stats,
    sources: breakdown.sources,
    details: breakdown.details,
    trial: trialStatus({
      rank: state.rank === 'SOVEREIGN' ? 'S' : state.rank,
      level: state.level,
      attempts: attempts.map((a) => ({ target: a.targetRank, at: a.createdAt.toISOString(), passed: a.passed })),
      now,
    }),
    attempts: attempts.slice(0, 5).map((a) => ({
      id: a.id, target: a.targetRank === 'SOVEREIGN' ? 'S' : a.targetRank, at: a.createdAt.toISOString(), passed: a.passed, composite: a.composite,
    })),
    xpByDay: [...byDay.entries()].sort().map(([date, xp]) => ({ date, xp })),
    prs: [...bestPr.values()].slice(0, 10).map((p) => ({ exerciseId: p.exerciseId, e1rmKg: Math.round(p.e1rmKg * 10) / 10, at: p.achievedAt.toISOString() })),
  };
}

export class TrialError extends Error {
  constructor(public code: 'not-eligible' | 'missing-events', message: string) {
    super(message);
  }
}

/** Server-scored Rank Trial (SYSTEMS.md §4.4). Idempotent by attempt id. */
export async function attemptTrial(prisma: PrismaClient, userId: string, input: TrialAttemptInput): Promise<TrialAttemptResponse> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.event.findUnique({ where: { id: input.id } });
    if (existing) return { ...(existing.payload as unknown as TrialAttemptResponse), duplicate: true };

    const now = new Date();
    const profile = await tx.profile.findUnique({ where: { id: userId } });
    const state = await tx.hunterState.findUnique({ where: { userId } });
    if (!profile || !state) throw new Error('profile not onboarded');
    const prior = await tx.trialAttempt.findMany({ where: { userId }, select: { targetRank: true, createdAt: true, passed: true } });
    const rank: Rank = state.rank === 'SOVEREIGN' ? 'S' : state.rank;
    const status = trialStatus({ rank, level: state.level, attempts: prior.map((a) => ({ target: a.targetRank, at: a.createdAt.toISOString(), passed: a.passed })), now });
    if (!status.eligible || !status.target) throw new TrialError('not-eligible', status.reason);

    const weight = await tx.bodyMetric.findFirst({ where: { userId, weightKg: { not: null } }, orderBy: { measuredAt: 'desc' }, select: { weightKg: true } });
    const records = await tx.personalRecord.findMany({ where: { userId }, select: { exerciseId: true, e1rmKg: true } });
    const bestE1rm: Record<string, number> = {};
    for (const r of records) bestE1rm[r.exerciseId] = Math.max(bestE1rm[r.exerciseId] ?? 0, r.e1rmKg);

    const events = scoreTrialEvents(
      {
        sex: (profile.sex ?? 'unspecified') as 'male', ageYears: ageFrom(profile.birthDate, now), bodyweightKg: weight?.weightKg ?? 75,
        setting: input.setting, results: input.results, bestE1rm,
      },
      assessmentNorms,
    );
    const stats = new Set(events.map((e) => e.stat));
    if (!stats.has('STR') || !stats.has('END') || (status.runRequired && !stats.has('AGI'))) {
      throw new TrialError('missing-events', status.runRequired ? 'STR, END and the 2.4 km run are required' : 'a strength and an endurance event are required');
    }
    const target = status.target;
    const evalr = evaluateTrial({ target, level: state.level, heroClass: (profile.heroClass ?? 'HYBRID') as HeroClass, events });
    const localDate = gameDate(now, profile.timezone);
    // The event is the idempotency key and the XP ledger's parent; its payload is filled in below.
    await tx.event.create({ data: { id: input.id, userId, type: 'trial.attempt', localDate, clientTs: now, payload: {} } });
    const rewards: unknown[] = [];
    if (evalr.passed) {
      await tx.hunterState.update({ where: { userId }, data: { rank: target } });
      rewards.push({ type: 'rankUp', from: rank, to: target });
      rewards.push(...(await grantXp(tx, { userId, eventId: input.id, localDate, amount: XP.rankTrialPass, reason: 'rankTrial' })));
    }
    await tx.trialAttempt.create({
      data: {
        id: input.id, userId, targetRank: target, setting: input.setting, results: input.results as never,
        events: events as never, composite: evalr.composite, passed: evalr.passed,
      },
    });
    const req = RANK_REQUIREMENTS[target];
    const response: TrialAttemptResponse = {
      attemptId: input.id, target, passed: evalr.passed, composite: Math.round(evalr.composite * 10) / 10,
      required: { composite: req.composite, minEvent: req.minEvent }, events, reasons: evalr.reasons,
      retryAt: evalr.passed ? null : new Date(now.getTime() + 7 * DAY).toISOString(), rewards, duplicate: false,
    };
    await tx.event.update({ where: { id: input.id }, data: { payload: response as never } });
    await recomputeStats(tx, userId, now);
    return response;
  });
}
