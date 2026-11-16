/**
 * Rewards for a finished workout — one function used by the app (preview/demo) and the API (authoritative).
 * SYSTEMS.md §4.1 (XP), §4.2 (levels), §3.1 (e1RM, PRs).
 */
import { bodyweightLoad, e1rm, type Zone } from '../training';
import { apBetween, levelFromXp } from './levels';
import { applyDailyCap, sessionXp, type SessionXpResult } from './xp';

export interface FinishedSet {
  exerciseId: string;
  reps: number | null;
  loadKg: number | null;
  rir: number | null;
  durationS?: number | null;
  isWarmup: boolean;
  /** catalogue data needed for PR math */
  bwFactor: number;
  kind: 'reps' | 'time';
}

export type WorkoutReward =
  | { type: 'xp'; amount: number; reason: string }
  | { type: 'levelUp'; from: number; to: number; ap: number }
  | { type: 'pr'; exerciseId: string; e1rmKg: number }
  | { type: 'capReached'; dropped: number };

export interface WorkoutRewardsResult {
  session: SessionXpResult;
  granted: number;
  newXp: number;
  levelFrom: number;
  levelTo: number;
  apGained: number;
  prs: { exerciseId: string; e1rmKg: number }[];
  /** updated best e1RM map (includes first-time baselines, which are not PRs) */
  bestE1rm: Record<string, number>;
  rewards: WorkoutReward[];
}

/** PR threshold: must beat the previous best by > 0.5 kg; first-ever logs set a baseline only. */
const PR_MARGIN_KG = 0.5;

export function computeWorkoutRewards(i: {
  sets: readonly FinishedSet[];
  plannedHardSets: number;
  cardio?: readonly { minutes: number; zone: Zone }[];
  bestE1rm: Readonly<Record<string, number>>;
  bodyweightKg: number;
  xpEarnedToday: number;
  currentXp: number;
}): WorkoutRewardsResult {
  // Best e1RM per exercise in this session
  const sessionBest: Record<string, number> = {};
  for (const s of i.sets) {
    if (s.isWarmup || s.kind !== 'reps' || !s.reps) continue;
    const load = s.bwFactor > 0 ? bodyweightLoad(i.bodyweightKg, s.bwFactor, s.loadKg ?? 0) : (s.loadKg ?? 0);
    const est = e1rm(load, s.reps, s.rir);
    if (est && est > (sessionBest[s.exerciseId] ?? 0)) sessionBest[s.exerciseId] = est;
  }
  const bestE1rm = { ...i.bestE1rm };
  const prs: { exerciseId: string; e1rmKg: number }[] = [];
  for (const [id, est] of Object.entries(sessionBest)) {
    const prev = i.bestE1rm[id];
    if (prev != null && est > prev + PR_MARGIN_KG) prs.push({ exerciseId: id, e1rmKg: Math.round(est * 10) / 10 });
    if (prev == null || est > prev) bestE1rm[id] = est;
  }

  const session = sessionXp({
    sets: i.sets.map((s) => ({ reps: s.reps ?? 0, loadKg: s.loadKg ?? 0, rir: s.rir, isWarmup: s.isWarmup })),
    plannedHardSets: i.plannedHardSets,
    cardio: i.cardio,
    prCount: prs.length,
  });
  const cap = applyDailyCap(i.xpEarnedToday, session.total);
  const newXp = i.currentXp + cap.granted;
  const levelFrom = levelFromXp(i.currentXp);
  const levelTo = levelFromXp(newXp);
  const apGained = apBetween(levelFrom, levelTo);

  const rewards: WorkoutReward[] = [{ type: 'xp', amount: cap.granted, reason: 'workout' }];
  for (const pr of prs.slice(0, 3)) rewards.push({ type: 'pr', ...pr });
  if (levelTo > levelFrom) rewards.push({ type: 'levelUp', from: levelFrom, to: levelTo, ap: apGained });
  if (cap.dropped > 0) rewards.push({ type: 'capReached', dropped: cap.dropped });

  return { session, granted: cap.granted, newXp, levelFrom, levelTo, apGained, prs, bestE1rm, rewards };
}
