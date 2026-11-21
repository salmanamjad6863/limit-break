/**
 * True Stats from real data — SYSTEMS.md §4.3. Every stat is a 0–100 percentile-style score.
 * Each stat reports its source so the UI can explain it ("measured" vs "estimated").
 */
import type { Sex } from '../body';
import type { Experience } from './initial';
import { decayedStat, percentileFromNorms, RANK_REQUIREMENTS, RANKS, spiScore, strengthAgeFactor, type NormAnchors, type Rank, type Stats, type TrialEventResult, type TrialStat } from './ranks';

type BySex = { male: NormAnchors; female: NormAnchors };
export interface StatNorms {
  pushups: BySex;
  plankSec: BySex;
  squats60: BySex;
  run2400Sec: BySex;
  strengthRatio: Record<string, BySex>;
  calisthenicsLevel: NormAnchors;
}

export const KEY_LIFTS = ['back-squat', 'bench-press', 'deadlift', 'overhead-press'] as const;

const EXPERIENCE_ESTIMATE: Record<Experience, number> = { beginner: 20, novice: 35, intermediate: 50, advanced: 65, pro: 78 };
/** Weekly hard-set target across the whole body (§3.2 tiers × ~5 muscle groups). */
export const WEEKLY_HARD_SET_TARGET: Record<Experience, number> = { beginner: 30, novice: 40, intermediate: 50, advanced: 60, pro: 70 };

export function bySex(value: number, table: BySex, sex: Sex): number {
  if (sex === 'male') return percentileFromNorms(value, table.male);
  if (sex === 'female') return percentileFromNorms(value, table.female);
  return (percentileFromNorms(value, table.male) + percentileFromNorms(value, table.female)) / 2;
}

export interface FitnessTests {
  pushups?: number | null;
  plankSec?: number | null;
  squats60?: number | null;
  run2400Sec?: number | null;
}

/** Percentile per key lift from e1RM / bodyweight × age factor. */
export function liftPercentiles(
  bestE1rm: Readonly<Record<string, number>>,
  i: { sex: Sex; ageYears: number; bodyweightKg: number },
  norms: StatNorms,
): { liftId: string; ratio: number; percentile: number }[] {
  const out: { liftId: string; ratio: number; percentile: number }[] = [];
  for (const id of KEY_LIFTS) {
    const e1 = bestE1rm[id];
    const table = norms.strengthRatio[id];
    if (!e1 || !table || i.bodyweightKg <= 0) continue;
    const ratio = (e1 / i.bodyweightKg) * strengthAgeFactor(i.ageYears);
    out.push({ liftId: id, ratio, percentile: bySex(ratio, table, i.sex) });
  }
  return out.sort((a, b) => b.percentile - a.percentile);
}

export type StatSource = 'measured' | 'estimated';
export interface StatBreakdown {
  stats: Stats;
  sources: Record<keyof Stats, StatSource>;
  /** human-readable inputs behind each stat */
  details: Record<keyof Stats, string>;
}

export function computeTrueStats(
  i: {
    sex: Sex;
    ageYears: number;
    bodyweightKg: number;
    experience: Experience;
    tests: FitnessTests;
    bestE1rm: Readonly<Record<string, number>>;
    /** highest level reached in each calisthenics chain (1-based) */
    calisthenicsLevels: readonly number[];
    weeklyHardSets4w: number;
    sessionsDone28: number;
    sessionsPlanned28: number;
    questRate28?: number | null;
    loggingRate28?: number | null;
    /** sleep/nutrition-based score once those features exist */
    vit?: number | null;
    /** weeks since the last test or PR — drives detraining decay */
    weeksSinceData?: number;
  },
  norms: StatNorms,
): StatBreakdown {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const est = EXPERIENCE_ESTIMATE[i.experience];
  const t = i.tests;

  // STR = max(gym, calisthenics/push-up) — §4.3
  const lifts = liftPercentiles(i.bestE1rm, i, norms).slice(0, 3);
  const strGym = lifts.length ? lifts.reduce((s, l) => s + l.percentile, 0) / lifts.length : null;
  const calLevel = i.calisthenicsLevels.length ? Math.max(...i.calisthenicsLevels) : 0;
  const strCal = calLevel > 0 ? percentileFromNorms(calLevel, norms.calisthenicsLevel) : null;
  const strPush = t.pushups != null ? bySex(t.pushups, norms.pushups, i.sex) : null;
  const strCandidates = [strGym, strCal, strPush].filter((x): x is number => x != null);
  const STR = strCandidates.length ? Math.max(...strCandidates) : est;

  // END = 0.7 × mean test percentile + 0.3 × volume score
  const endTests = [
    t.pushups != null ? bySex(t.pushups, norms.pushups, i.sex) : null,
    t.plankSec != null ? bySex(t.plankSec, norms.plankSec, i.sex) : null,
    t.squats60 != null ? bySex(t.squats60, norms.squats60, i.sex) : null,
  ].filter((x): x is number => x != null);
  const volumeScore = 100 * Math.min(1, i.weeklyHardSets4w / WEEKLY_HARD_SET_TARGET[i.experience]);
  const testMean = endTests.length ? endTests.reduce((s, x) => s + x, 0) / endTests.length : est;
  const END = 0.7 * testMean + 0.3 * volumeScore;

  // AGI from the 2.4 km run (other sources arrive with HealthKit / Health Connect)
  const AGI = t.run2400Sec != null ? bySex(t.run2400Sec, norms.run2400Sec, i.sex) : 20;

  const VIT = i.vit ?? 30;

  const sessionRate = i.sessionsPlanned28 > 0 ? Math.min(1, i.sessionsDone28 / i.sessionsPlanned28) : 0;
  const SPI =
    i.sessionsPlanned28 > 0 || i.questRate28 != null
      ? i.questRate28 != null
        ? spiScore({ questRate: i.questRate28, sessionRate, loggingRate: i.loggingRate28 ?? null })
        : 100 * sessionRate // only training data so far
      : 10;

  const decay = (x: number) => (i.weeksSinceData ? decayedStat(x, i.weeksSinceData) : x);
  const stats: Stats = { STR: r1(decay(STR)), AGI: r1(decay(AGI)), END: r1(decay(END)), VIT: r1(VIT), SPI: r1(SPI) };

  return {
    stats,
    sources: {
      STR: strCandidates.length ? 'measured' : 'estimated',
      AGI: t.run2400Sec != null ? 'measured' : 'estimated',
      END: endTests.length ? 'measured' : 'estimated',
      VIT: i.vit != null ? 'measured' : 'estimated',
      SPI: i.sessionsPlanned28 > 0 || i.questRate28 != null ? 'measured' : 'estimated',
    },
    details: {
      STR: strGym != null && strGym >= Math.max(strCal ?? 0, strPush ?? 0)
        ? `Best lifts vs bodyweight (${lifts.map((l) => `${l.ratio.toFixed(2)}×`).join(', ')})`
        : strCal != null && strCal >= (strPush ?? 0)
          ? `Calisthenics level ${calLevel}`
          : strPush != null ? `${t.pushups} push-ups` : 'Estimated from experience',
      AGI: t.run2400Sec != null ? `2.4 km in ${Math.floor(t.run2400Sec / 60)}:${String(t.run2400Sec % 60).padStart(2, '0')}` : 'Run the 2.4 km test to measure',
      END: `${endTests.length ? `${endTests.length} test(s)` : 'Estimated'} + ${Math.round(i.weeklyHardSets4w)} hard sets/week`,
      VIT: i.vit != null ? 'Sleep and nutrition' : 'Unlocks with sleep and nutrition tracking',
      SPI: i.sessionsPlanned28 > 0 ? `${i.sessionsDone28}/${i.sessionsPlanned28} planned sessions (28 days)` : 'Builds as you follow your plan',
    },
  };
}

/* ---------------- Rank Trials (§4.4) ---------------- */

export type TrialEventId = 'pushups' | 'lift' | 'plankSec' | 'squats60' | 'run2400Sec';
export interface ScoredTrialEvent extends TrialEventResult {
  id: TrialEventId;
  raw: number;
  /** e.g. which lift was used */
  note?: string;
}

/** Turns raw trial results into scored events. Gym STR uses logged lifts; falls back to push-ups. */
export function scoreTrialEvents(
  i: {
    sex: Sex;
    ageYears: number;
    bodyweightKg: number;
    setting: 'HOME' | 'GYM';
    results: FitnessTests;
    bestE1rm: Readonly<Record<string, number>>;
  },
  norms: StatNorms,
): ScoredTrialEvent[] {
  const out: ScoredTrialEvent[] = [];
  const r = i.results;
  const best = i.setting === 'GYM' ? liftPercentiles(i.bestE1rm, i, norms)[0] : undefined;
  if (best) out.push({ id: 'lift', stat: 'STR', raw: Math.round(best.ratio * 100) / 100, percentile: best.percentile, note: best.liftId });
  else if (r.pushups != null) out.push({ id: 'pushups', stat: 'STR', raw: r.pushups, percentile: bySex(r.pushups, norms.pushups, i.sex) });
  if (r.plankSec != null) out.push({ id: 'plankSec', stat: 'END', raw: r.plankSec, percentile: bySex(r.plankSec, norms.plankSec, i.sex) });
  if (r.squats60 != null) out.push({ id: 'squats60', stat: 'END', raw: r.squats60, percentile: bySex(r.squats60, norms.squats60, i.sex) });
  if (r.run2400Sec != null) out.push({ id: 'run2400Sec', stat: 'AGI', raw: r.run2400Sec, percentile: bySex(r.run2400Sec, norms.run2400Sec, i.sex) });
  return out.map((e) => ({ ...e, percentile: Math.round(e.percentile * 10) / 10 }));
}

export const TRIAL_COOLDOWN_DAYS = 7;

export interface TrialStatus {
  target: Exclude<Rank, 'E'> | null;
  levelRequired: number | null;
  eligible: boolean;
  reason: 'max-rank' | 'level' | 'cooldown' | 'ready';
  retryAt: string | null;
  /** AGI (run) is required from this rank upward */
  runRequired: boolean;
}

/** Can the user attempt their next Rank Trial now? (level gate + 7-day retry cooldown) */
export function trialStatus(i: {
  rank: Rank;
  level: number;
  attempts: readonly { target: string; at: string; passed: boolean }[];
  now?: Date;
}): TrialStatus {
  const idx = RANKS.indexOf(i.rank);
  const target = (RANKS[idx + 1] as Exclude<Rank, 'E'> | undefined) ?? null;
  if (!target) return { target: null, levelRequired: null, eligible: false, reason: 'max-rank', retryAt: null, runRequired: false };
  const req = RANK_REQUIREMENTS[target];
  const runRequired = RANKS.indexOf(target) >= RANKS.indexOf('B');
  if (i.level < req.level) return { target, levelRequired: req.level, eligible: false, reason: 'level', retryAt: null, runRequired };
  const now = (i.now ?? new Date()).getTime();
  const lastFail = i.attempts
    .filter((a) => a.target === target && !a.passed)
    .map((a) => Date.parse(a.at))
    .sort((a, b) => b - a)[0];
  if (lastFail != null) {
    const retry = lastFail + TRIAL_COOLDOWN_DAYS * 86_400_000;
    if (now < retry) return { target, levelRequired: req.level, eligible: false, reason: 'cooldown', retryAt: new Date(retry).toISOString(), runRequired };
  }
  return { target, levelRequired: req.level, eligible: true, reason: 'ready', retryAt: null, runRequired };
}

export type { TrialStat };
