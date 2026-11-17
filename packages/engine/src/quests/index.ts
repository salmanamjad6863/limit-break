/**
 * Daily Quests, streaks and the Shadow-Self boss — SYSTEMS.md §4.5–4.7.
 * Pure functions; the API and the app (demo mode) share them.
 */
import type { HeroClass } from '../progression/ranks';
import type { Experience } from '../progression/initial';
import { DAY_MS } from '../math';

/* ---------------- Daily Quest (§4.6) ---------------- */

export interface QuestBaselines {
  pushups?: number | null;
  plankSec?: number | null;
  squats60?: number | null;
}

export type QuestUnit = 'reps' | 'sec' | 'min';
export interface QuestSlot {
  id: 'push' | 'legs' | 'core' | 'cardio' | 'ritual';
  exerciseId: string;
  target: number;
  unit: QuestUnit;
}

export const QUEST_SCALE = { start: 0.6, min: 0.4, max: 1, weeklyStep: 0.02, failStep: 0.1, trainingDayFactor: 0.6, timeBoxMin: 12 } as const;

const DEFAULT_BASELINES: Record<Experience, Required<{ pushups: number; plankSec: number; squats60: number }>> = {
  beginner: { pushups: 8, plankSec: 30, squats60: 25 },
  novice: { pushups: 15, plankSec: 45, squats60: 35 },
  intermediate: { pushups: 25, plankSec: 75, squats60: 40 },
  advanced: { pushups: 35, plankSec: 110, squats60: 45 },
};

/** Seconds per rep (for the time box) and rest between slots. */
const SEC_PER_REP: Record<string, number> = { 'push-up': 3, 'knee-push-up': 3, 'bodyweight-squat': 2.5, 'glute-bridge': 2.5, 'dead-bug': 3 };
const SLOT_REST_SEC = 60;

export function estimateQuestSeconds(slots: readonly QuestSlot[]): number {
  return slots.reduce((s, q) => s + SLOT_REST_SEC + (q.unit === 'sec' ? q.target : q.unit === 'min' ? q.target * 60 : q.target * (SEC_PER_REP[q.exerciseId] ?? 3)), 0);
}

/** Rest days: a 3-minute mobility ritual that still counts for the streak (§4.5). */
export const REST_RITUAL: QuestSlot[] = [
  { id: 'ritual', exerciseId: 'cat-cow', target: 60, unit: 'sec' },
  { id: 'ritual', exerciseId: 'worlds-greatest-stretch', target: 60, unit: 'sec' },
  { id: 'ritual', exerciseId: 'childs-pose', target: 60, unit: 'sec' },
];

export function generateDailyQuest(i: {
  baselines: QuestBaselines;
  experience: Experience;
  scale: number;
  trainingDay: boolean;
  heroClass?: HeroClass | null;
  injuries?: readonly string[];
}): QuestSlot[] {
  const d = DEFAULT_BASELINES[i.experience];
  const f = Math.min(QUEST_SCALE.max, Math.max(QUEST_SCALE.min, i.scale)) * (i.trainingDay ? QUEST_SCALE.trainingDayFactor : 1);
  const inj = new Set(i.injuries ?? []);
  const push = i.baselines.pushups ?? d.pushups;
  const squats = i.baselines.squats60 ?? d.squats60;
  const plank = i.baselines.plankSec ?? d.plankSec;

  const slots: QuestSlot[] = [];
  // push — wrist/shoulder injuries swap to a pain-free alternative
  if (inj.has('wrist') || inj.has('shoulder')) slots.push({ id: 'push', exerciseId: 'glute-bridge', target: Math.max(8, Math.round(squats * f * 0.6)), unit: 'reps' });
  else if (push * f < 5) slots.push({ id: 'push', exerciseId: 'knee-push-up', target: Math.max(5, Math.round(push * 2 * f)), unit: 'reps' });
  else slots.push({ id: 'push', exerciseId: 'push-up', target: Math.max(3, Math.round(push * f)), unit: 'reps' });
  // legs — knee injury swaps squats for glute bridges
  if (inj.has('knee')) slots.push({ id: 'legs', exerciseId: 'glute-bridge', target: Math.max(10, Math.round(squats * f)), unit: 'reps' });
  else slots.push({ id: 'legs', exerciseId: 'bodyweight-squat', target: Math.max(8, Math.round(squats * f)), unit: 'reps' });
  // core
  if (inj.has('shoulder')) slots.push({ id: 'core', exerciseId: 'dead-bug', target: Math.max(8, Math.round(10 + 10 * f)), unit: 'reps' });
  else slots.push({ id: 'core', exerciseId: 'plank', target: Math.max(15, Math.round((plank * f) / 5) * 5), unit: 'sec' });
  if (i.heroClass === 'RANGER') slots.push({ id: 'cardio', exerciseId: 'brisk-walk', target: i.trainingDay ? 5 : 10, unit: 'min' });

  // time box (§4.6): if over 12 minutes, scale EVERY slot's work down proportionally (rest stays fixed)
  const total = estimateQuestSeconds(slots);
  const limit = QUEST_SCALE.timeBoxMin * 60;
  if (total > limit) {
    const rest = slots.length * SLOT_REST_SEC;
    const k = Math.max(0.2, (limit - rest) / (total - rest));
    for (const s of slots) {
      const floor = s.unit === 'sec' ? 15 : s.unit === 'min' ? 3 : 3;
      const v = s.target * k;
      s.target = Math.max(floor, s.unit === 'sec' ? Math.floor(v / 5) * 5 : Math.floor(v));
    }
  }
  return slots;
}

/** Penalty Quest (§4.5): ~5 minutes; two options so injuries never block redemption. */
export function penaltyQuestOptions(i: { scale: number; injuries?: readonly string[] }): QuestSlot[][] {
  const inj = new Set(i.injuries ?? []);
  const burpees = Math.round(Math.min(30, Math.max(10, 10 + 20 * (i.scale - 0.4) / 0.6)));
  const opts: QuestSlot[][] = [];
  if (!inj.has('knee') && !inj.has('wrist') && !inj.has('lower_back')) opts.push([{ id: 'push', exerciseId: 'burpee', target: burpees, unit: 'reps' }]);
  if (!inj.has('knee')) opts.push([{ id: 'legs', exerciseId: 'wall-sit', target: 180, unit: 'sec' }]);
  opts.push([{ id: 'core', exerciseId: inj.has('shoulder') ? 'dead-bug' : 'plank', target: inj.has('shoulder') ? 40 : 120, unit: inj.has('shoulder') ? 'reps' : 'sec' }]);
  return opts.slice(0, 2);
}

/** Weekly +0.02 when ≥ 5/7 completions; −0.10 after two failed days in a row (§4.6). */
export function adjustQuestScale(scale: number, e: { weekCompletions?: number; consecutiveFails?: number }): number {
  let s = scale;
  if (e.weekCompletions != null && e.weekCompletions >= 5) s += QUEST_SCALE.weeklyStep;
  if (e.consecutiveFails != null && e.consecutiveFails >= 2) s -= QUEST_SCALE.failStep;
  return Math.round(Math.min(QUEST_SCALE.max, Math.max(QUEST_SCALE.min, s)) * 100) / 100;
}

/* ---------------- Streaks (§4.5) ---------------- */

export const STREAK = { freeShieldsPerMonth: 2, sickDaysPer30: 7, milestones: [7, 30, 100, 365] } as const;

export interface StreakState {
  streak: number;
  longest: number;
  shields: number;
  /** 'YYYY-MM' the shields were last refilled for */
  shieldsMonth: string | null;
  /** a missed day awaiting redemption the following day */
  penaltyDate: string | null;
  /** last game date already resolved */
  lastResolved: string | null;
  /** sick/injury dates (for the rolling 7-in-30 limit) */
  sickDates: string[];
  questScale: number;
  consecutiveFails: number;
}

export interface DayRecord {
  dailyDone: boolean;
  penaltyDone: boolean;
  sick: boolean;
}

export type StreakEvent =
  | { type: 'shieldUsed'; date: string }
  | { type: 'penaltyZone'; date: string }
  | { type: 'streakSaved'; date: string }
  | { type: 'streakReset'; date: string; lost: number }
  | { type: 'sickDay'; date: string }
  | { type: 'milestone'; date: string; days: number }
  | { type: 'scaleChanged'; date: string; from: number; to: number };

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const dayAt = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => iso(dayAt(d) + n * DAY_MS);

export const newStreakState = (): StreakState => ({
  streak: 0, longest: 0, shields: STREAK.freeShieldsPerMonth, shieldsMonth: null, penaltyDate: null,
  lastResolved: null, sickDates: [], questScale: QUEST_SCALE.start, consecutiveFails: 0,
});

/** Sick days allowed on `date` given the rolling 30-day window. */
export function sickAllowed(sickDates: readonly string[], date: string): boolean {
  const from = dayAt(date) - 29 * DAY_MS;
  return sickDates.filter((d) => dayAt(d) >= from && dayAt(d) <= dayAt(date)).length < STREAK.sickDaysPer30;
}

/**
 * Resolves every unresolved game day up to and including `through` (normally yesterday).
 * Idempotent: re-running with the same inputs changes nothing.
 */
export function resolveStreak(
  prev: StreakState,
  records: Readonly<Record<string, DayRecord>>,
  through: string,
  firstDay: string,
): { state: StreakState; events: StreakEvent[] } {
  const s: StreakState = { ...prev, sickDates: [...prev.sickDates] };
  const events: StreakEvent[] = [];
  let d = s.lastResolved ? addDays(s.lastResolved, 1) : firstDay;
  let weekDone = 0;
  while (dayAt(d) <= dayAt(through)) {
    const month = d.slice(0, 7);
    if (s.shieldsMonth !== month) {
      s.shields = Math.max(s.shields, STREAK.freeShieldsPerMonth);
      s.shieldsMonth = month;
    }
    const r = records[d] ?? { dailyDone: false, penaltyDone: false, sick: false };
    if (r.sick && sickAllowed(s.sickDates, d)) {
      s.sickDates.push(d);
      events.push({ type: 'sickDay', date: d });
    } else if (s.penaltyDate) {
      // redemption day: daily + penalty saves the streak
      const lost = s.streak;
      if (r.dailyDone && r.penaltyDone) {
        s.streak += 1;
        events.push({ type: 'streakSaved', date: d });
      } else {
        s.streak = r.dailyDone ? 1 : 0;
        if (lost > 0) events.push({ type: 'streakReset', date: d, lost });
      }
      s.penaltyDate = null;
      s.consecutiveFails = r.dailyDone ? 0 : s.consecutiveFails + 1;
    } else if (r.dailyDone) {
      s.streak += 1;
      s.consecutiveFails = 0;
      if ((STREAK.milestones as readonly number[]).includes(s.streak)) events.push({ type: 'milestone', date: d, days: s.streak });
    } else {
      s.consecutiveFails += 1;
      if (s.shields > 0) {
        s.shields -= 1;
        events.push({ type: 'shieldUsed', date: d });
      } else {
        s.penaltyDate = d;
        events.push({ type: 'penaltyZone', date: d });
      }
    }
    if (r.dailyDone) weekDone += 1;
    s.longest = Math.max(s.longest, s.streak);

    // quest scale: −0.10 at two fails in a row; +0.02 at the end of a week with ≥ 5 completions
    if (s.consecutiveFails === 2) {
      const to = adjustQuestScale(s.questScale, { consecutiveFails: 2 });
      if (to !== s.questScale) events.push({ type: 'scaleChanged', date: d, from: s.questScale, to });
      s.questScale = to;
    }
    if (new Date(dayAt(d)).getUTCDay() === 0) {
      const to = adjustQuestScale(s.questScale, { weekCompletions: weekDone });
      if (to !== s.questScale) events.push({ type: 'scaleChanged', date: d, from: s.questScale, to });
      s.questScale = to;
      weekDone = 0;
    }
    s.lastResolved = d;
    d = addDays(d, 1);
  }
  return { state: s, events };
}

/** Streak to display today: resolved streak + today's completion (unless today is a redemption day not yet earned). */
export function displayStreak(s: StreakState, today: { dailyDone: boolean; penaltyDone: boolean }): number {
  if (s.penaltyDate) return today.dailyDone && today.penaltyDone ? s.streak + 1 : s.streak;
  return s.streak + (today.dailyDone ? 1 : 0);
}

/* ---------------- Shadow-Self boss (§4.7) ---------------- */

export interface BossMetrics {
  hardSets: number;
  volumeKg: number;
  cardioMin: number;
  questDays: number;
}

const BOSS_WEIGHTS: Partial<Record<HeroClass, Record<keyof BossMetrics, number>>> & { default: Record<keyof BossMetrics, number> } = {
  default: { hardSets: 0.35, volumeKg: 0.25, cardioMin: 0.2, questDays: 0.2 },
  FIGHTER: { hardSets: 0.3, volumeKg: 0.4, cardioMin: 0.1, questDays: 0.2 },
  JUGGERNAUT: { hardSets: 0.4, volumeKg: 0.35, cardioMin: 0.05, questDays: 0.2 },
  RANGER: { hardSets: 0.2, volumeKg: 0.1, cardioMin: 0.5, questDays: 0.2 },
  MONK: { hardSets: 0.3, volumeKg: 0.1, cardioMin: 0.2, questDays: 0.4 },
};
export const BOSS_REQUIRED: Record<Experience, number> = { beginner: 1.03, novice: 1.02, intermediate: 1.01, advanced: 1.0 };

/** S = Σ w·min(current/past, 1.5) over metrics that have a baseline (past, or the plan when past is 0). */
export function shadowBoss(i: {
  current: BossMetrics;
  past: BossMetrics | null;
  planned: BossMetrics;
  heroClass?: HeroClass | null;
  experience: Experience;
}): { score: number; required: number; hpPct: number; won: boolean; prophecy: boolean } {
  const w = (i.heroClass && BOSS_WEIGHTS[i.heroClass]) || BOSS_WEIGHTS.default;
  let num = 0;
  let den = 0;
  let prophecy = true;
  for (const k of Object.keys(w) as (keyof BossMetrics)[]) {
    const base = i.past && i.past[k] > 0 ? i.past[k] : i.planned[k];
    if (i.past && i.past[k] > 0) prophecy = false;
    if (base <= 0) continue;
    num += w[k] * Math.min(i.current[k] / base, 1.5);
    den += w[k];
  }
  const score = den > 0 ? num / den : 0;
  const required = BOSS_REQUIRED[i.experience];
  return { score: Math.round(score * 1000) / 1000, required, hpPct: Math.round(Math.max(0, 1 - score / required) * 1000) / 10, won: score >= required, prophecy };
}
