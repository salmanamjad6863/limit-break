/**
 * Workout generator — PLAN.md §5.6–5.8, SYSTEMS.md §3.6, §3.8, §3.9.
 * Pure: takes a program day + the user's context + the exercise catalogue, returns a session.
 */
import { e1rm as calcE1rm, pct1rm, REST_SECONDS, warmupSets, type RestType } from './index';

import type { Experience } from '../progression/initial';
export type SlotRole = 'main' | 'secondary' | 'accessory' | 'core' | 'finisher';
export type LoadType = 'barbell' | 'dumbbell' | 'kettlebell' | 'machine' | 'band' | 'bodyweight' | 'none';

export interface CatalogExercise {
  id: string;
  name: string;
  pattern: string;
  equipment: string[];
  anyOf?: string[];
  difficulty: number;
  bwFactor: number;
  restType: RestType;
  kind: 'reps' | 'time';
  loadType: LoadType;
  unilateral?: boolean;
  avoid?: string[];
}

export interface TemplateSlot {
  pattern: string;
  fallback?: string[];
  role: SlotRole;
  sets: number;
  reps?: [number, number];
  seconds?: [number, number];
  rir: number;
  prefer?: string[];
  optional?: boolean;
}

export interface TemplateDay {
  id: string;
  name: string;
  focus: 'upper' | 'lower' | 'full';
  slots: TemplateSlot[];
}

export interface TrainingContext {
  equipment: string[];
  injuries: string[];
  experience: Experience;
  sessionMinutes: number;
  bodyweightKg: number;
  /** best e1RM per exercise id (kg; per hand for dumbbells) */
  bestE1rm?: Record<string, number>;
  /** exercises the user flagged as painful — never selected */
  avoidExercises?: string[];
  /** pattern → exercise id used last time (consistency bonus) */
  lastUsed?: Record<string, string>;
  /** slot index → forced exercise id (user swap) */
  swaps?: Record<number, string>;
  /** 0–100; < 40 → lighter session (SYSTEMS §3.5) */
  readiness?: number | null;
}

export interface PlannedSet {
  kind: 'warmup' | 'working';
  reps?: [number, number];
  seconds?: [number, number];
  rir: number;
  /** suggested load in kg, null = bodyweight / pick a weight */
  loadKg: number | null;
}

export interface PlannedExercise {
  slotIndex: number;
  exerciseId: string;
  role: SlotRole;
  restSeconds: number;
  sets: PlannedSet[];
  /** other valid picks for the Swap sheet, best first */
  alternatives: string[];
  /** superset pairing from the time-squeeze: exercises sharing a letter alternate sets (A1/A2) */
  supersetGroup?: string;
}

export interface GeneratedWorkout {
  dayId: string;
  name: string;
  focus: TemplateDay['focus'];
  exercises: PlannedExercise[];
  estimatedMinutes: number;
  lightened: boolean;
  /** slots that had no valid exercise for this user's equipment/injuries */
  unfilled: string[];
}

const TARGET_DIFFICULTY: Record<Experience, number> = { beginner: 1.5, novice: 2.5, intermediate: 3.5, advanced: 4.5, pro: 5 };
export const LOAD_STEP: Record<LoadType, number | null> = {
  barbell: 2.5, dumbbell: 2, kettlebell: 4, machine: 2.5, band: null, bodyweight: null, none: null,
};

export const roundLoad = (kg: number, type: LoadType): number => {
  const step = LOAD_STEP[type];
  return step ? Math.max(step, Math.round(kg / step) * step) : kg;
};

/** Equipment rule: every `equipment` item owned, and at least one of `anyOf` if present. */
export function canPerform(e: CatalogExercise, ctx: Pick<TrainingContext, 'equipment' | 'injuries' | 'avoidExercises'>): boolean {
  const owned = new Set(ctx.equipment);
  if (!e.equipment.every((x) => owned.has(x))) return false;
  if (e.anyOf?.length && !e.anyOf.some((x) => owned.has(x))) return false;
  if (e.avoid?.some((t) => ctx.injuries.includes(t))) return false;
  if (ctx.avoidExercises?.includes(e.id)) return false;
  return true;
}

/**
 * Ranked candidates for a slot: primary pattern first; fallback patterns only if none fit.
 * `exclude` (already used in this session) is applied BEFORE deciding to fall back.
 */
export function candidatesFor(
  slot: TemplateSlot,
  catalog: readonly CatalogExercise[],
  ctx: TrainingContext,
  exclude: ReadonlySet<string> = new Set(),
): CatalogExercise[] {
  const target = TARGET_DIFFICULTY[ctx.experience];
  const score = (e: CatalogExercise) => {
    const pi = slot.prefer?.indexOf(e.id) ?? -1;
    return (pi >= 0 ? 100 - pi * 10 : 0) + (ctx.lastUsed?.[slot.pattern] === e.id ? 30 : 0) - 15 * Math.abs(e.difficulty - target);
  };
  const fits = (e: CatalogExercise) =>
    canPerform(e, ctx) && e.difficulty <= target + 1.5 && (slot.seconds ? e.kind === 'time' || e.pattern === 'carry' || e.pattern === 'conditioning' : e.kind === 'reps');
  for (const pattern of [slot.pattern, ...(slot.fallback ?? [])]) {
    const list = catalog.filter((e) => e.pattern === pattern && !exclude.has(e.id) && fits(e)).sort((a, b) => score(b) - score(a));
    if (list.length) return list;
  }
  return [];
}

function restFor(e: CatalogExercise, slot: TemplateSlot): number {
  if (slot.role === 'finisher') return slot.seconds ? slot.seconds[0] : 30;
  const base = REST_SECONDS[e.restType];
  // heavy main work (≤ 6 reps) gets strength rest
  if (slot.role === 'main' && slot.reps && slot.reps[1] <= 6) return Math.max(base, 180);
  return base;
}

function suggestedLoad(e: CatalogExercise, slot: TemplateSlot, ctx: TrainingContext): number | null {
  if (!slot.reps || LOAD_STEP[e.loadType] == null) return null;
  const best = ctx.bestE1rm?.[e.id];
  if (!best) return null;
  return roundLoad(best * pct1rm(slot.reps[1], slot.rir), e.loadType);
}

function plan(slot: TemplateSlot, slotIndex: number, e: CatalogExercise, alternatives: string[], ctx: TrainingContext, lighten: boolean): PlannedExercise {
  const load = suggestedLoad(e, slot, ctx);
  const rir = lighten ? slot.rir + 1 : slot.rir;
  const setCount = lighten ? Math.max(2, Math.round(slot.sets * 0.7)) : slot.sets;
  const working: PlannedSet[] = Array.from({ length: setCount }, () => ({
    kind: 'working', reps: slot.reps, seconds: slot.seconds, rir, loadKg: load,
  }));
  const warm: PlannedSet[] =
    slot.role === 'main' && load != null
      ? warmupSets(load, LOAD_STEP[e.loadType] ?? 2.5).map((w) => ({ kind: 'warmup' as const, reps: [w.reps, w.reps] as [number, number], rir: 5, loadKg: w.kg }))
      : [];
  return { slotIndex, exerciseId: e.id, role: slot.role, restSeconds: restFor(e, slot), sets: [...warm, ...working], alternatives };
}

/** Warm-up + cool-down overhead: 8 min normally, 4 min for short (≤ 20 min) sessions. */
export const overheadMinutes = (sessionMinutes: number) => (sessionMinutes <= 20 ? 4 : 8);

/** Minutes: overhead + Σ(work + rest) per set (unilateral reps count twice). */
export function estimateMinutes(
  exercises: readonly PlannedExercise[],
  catalog: ReadonlyMap<string, CatalogExercise>,
  overhead = 8,
): number {
  let sec = overhead * 60;
  for (const pe of exercises) {
    const e = catalog.get(pe.exerciseId);
    for (const s of pe.sets) {
      const work = s.seconds ? (s.seconds[0] + s.seconds[1]) / 2 : ((s.reps![0] + s.reps![1]) / 2) * 3;
      sec += work * (e?.unilateral ? 2 : 1) + (s.kind === 'warmup' ? 60 : pe.restSeconds);
    }
  }
  return Math.round(sec / 60);
}

const workingCount = (pe: PlannedExercise) => pe.sets.filter((s) => s.kind === 'working').length;
function dropWorkingSet(pe: PlannedExercise, min: number): boolean {
  if (workingCount(pe) <= min) return false;
  const i = pe.sets.map((s) => s.kind).lastIndexOf('working');
  pe.sets.splice(i, 1);
  return true;
}

/** SYSTEMS §3.6 time-squeeze, in order of least to most important. Compounds never drop below 2 sets. */
function squeeze(list: PlannedExercise[], slots: readonly TemplateSlot[], minutes: number, catalog: ReadonlyMap<string, CatalogExercise>) {
  const overhead = overheadMinutes(minutes);
  const over = () => estimateMinutes(list, catalog, overhead) > minutes;
  const byRole = (r: SlotRole) => list.filter((p) => p.role === r);
  // 1. optional slots
  for (let i = list.length - 1; i >= 0 && over(); i--) if (slots[list[i]!.slotIndex]?.optional) list.splice(i, 1);
  // 2. finisher and accessories down to 2 sets, core down to 2
  for (const r of ['finisher', 'accessory', 'core'] as SlotRole[]) for (const p of byRole(r)) while (over() && dropWorkingSet(p, 2));
  // 3. remove accessories from the end, then the finisher
  for (const r of ['accessory', 'finisher'] as SlotRole[])
    for (let i = list.length - 1; i >= 0 && over(); i--) if (list[i]!.role === r) list.splice(i, 1);
  // 4. secondary then main down to 2 working sets (never below 2 for compounds)
  for (const r of ['secondary', 'core', 'main'] as SlotRole[]) for (const p of byRole(r)) while (over() && dropWorkingSet(p, 2));
  // 5. pair the non-main exercises into supersets (A1/A2 alternate; rest × 0.6)
  if (over()) {
    const rest = list.filter((p) => p.role !== 'main');
    for (let i = 0; i + 1 < rest.length; i += 2) {
      const g = String.fromCharCode(65 + i / 2);
      for (const p of [rest[i]!, rest[i + 1]!]) {
        p.supersetGroup = g;
        p.restSeconds = Math.round(p.restSeconds * 0.6);
      }
    }
    if (rest.length % 2 === 1) rest.at(-1)!.restSeconds = Math.round(rest.at(-1)!.restSeconds * 0.6);
  }
  // 6. drop core, then secondary work from the end
  for (const r of ['core', 'secondary'] as SlotRole[])
    for (let i = list.length - 1; i >= 0 && over(); i--) if (list[i]!.role === r) list.splice(i, 1);
  // 7. last resort: shorter rest on the main lifts (× 0.75)
  if (over()) for (const p of list) p.restSeconds = Math.round(p.restSeconds * 0.75);
}

export function generateWorkout(day: TemplateDay, catalog: readonly CatalogExercise[], ctx: TrainingContext): GeneratedWorkout {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const used = new Set<string>();
  const out: PlannedExercise[] = [];
  const unfilled: string[] = [];
  const lighten = ctx.readiness != null && ctx.readiness < 40;

  day.slots.forEach((slot, i) => {
    const ranked = candidatesFor(slot, catalog, ctx, used);
    const forced = ctx.swaps?.[i] ? byId.get(ctx.swaps[i]!) : undefined;
    const pick = forced && canPerform(forced, ctx) ? forced : ranked[0];
    if (!pick) {
      if (!slot.optional) unfilled.push(slot.pattern);
      return;
    }
    used.add(pick.id);
    const alternatives = ranked.filter((e) => e.id !== pick.id).slice(0, 5).map((e) => e.id);
    out.push(plan(slot, i, pick, alternatives, ctx, lighten));
  });

  squeeze(out, day.slots, ctx.sessionMinutes, byId);
  return {
    dayId: day.id, name: day.name, focus: day.focus, exercises: out,
    estimatedMinutes: estimateMinutes(out, byId, overheadMinutes(ctx.sessionMinutes)), lightened: lighten, unfilled,
  };
}

/* ---------------- schedule (SYSTEMS §3.9) ---------------- */

/** JS weekday numbers (0 = Sunday) the user trains on, for a days-per-week count. */
export const TRAINING_WEEKDAYS: Record<number, number[]> = {
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
};

export const isTrainingDay = (daysPerWeek: number, weekday: number) => (TRAINING_WEEKDAYS[daysPerWeek] ?? TRAINING_WEEKDAYS[3]!).includes(weekday);

/** Next program day in rotation (sessions advance the plan; missed calendar days don't skip workouts). */
export const nextDayIndex = (dayCount: number, completedSessions: number) => ((completedSessions % dayCount) + dayCount) % dayCount;

/** Monday-first week view: training weekdays get consecutive program days from today's position. */
export function weekPlan(dayIds: readonly string[], daysPerWeek: number, completedSessions: number, todayWeekday: number): (string | null)[] {
  const train = TRAINING_WEEKDAYS[daysPerWeek] ?? TRAINING_WEEKDAYS[3]!;
  const mondayFirst = [1, 2, 3, 4, 5, 6, 0];
  const todayPos = mondayFirst.indexOf(todayWeekday);
  const trainingBeforeToday = mondayFirst.slice(0, todayPos).filter((d) => train.includes(d)).length;
  let k = nextDayIndex(dayIds.length, completedSessions - trainingBeforeToday);
  return mondayFirst.map((d) => (train.includes(d) ? dayIds[k++ % dayIds.length]! : null));
}

/* ---------------- set coaching ---------------- */

/** First set of an unknown exercise: derive the next sets' load from what was just lifted. */
export function loadFromLoggedSet(
  logged: { reps: number; loadKg: number; rir: number },
  target: { reps: [number, number]; rir: number },
  loadType: LoadType,
): number | null {
  const est = calcE1rm(logged.loadKg, logged.reps, logged.rir);
  if (!est || LOAD_STEP[loadType] == null) return null;
  return roundLoad(est * pct1rm(target.reps[1], target.rir), loadType);
}

/**
 * Auto-adjust after a logged set: RIR 2+ easier than target → +5% (≥ one step);
 * 2+ harder, or reps below range → −5% (≥ one step); otherwise keep.
 */
export function adjustNextLoad(
  planned: { reps: [number, number]; rir: number; loadKg: number },
  logged: { reps: number; rir: number },
  loadType: LoadType,
): { loadKg: number; change: 'up' | 'down' | 'hold' } {
  const step = LOAD_STEP[loadType] ?? 0;
  if (!step) return { loadKg: planned.loadKg, change: 'hold' };
  const delta = Math.max(step, planned.loadKg * 0.05);
  if (logged.reps < planned.reps[0] || logged.rir <= planned.rir - 2) {
    return { loadKg: Math.max(step, roundLoad(planned.loadKg - delta, loadType)), change: 'down' };
  }
  if (logged.rir >= planned.rir + 2 && logged.reps >= planned.reps[0]) {
    return { loadKg: roundLoad(planned.loadKg + delta, loadType), change: 'up' };
  }
  return { loadKg: planned.loadKg, change: 'hold' };
}
