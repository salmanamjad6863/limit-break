/**
 * Personalised workouts (docs/plans/TRAIN_REDESIGN.md §4): one program template adapted to
 * - the hunter's level (Beginner → Novice → Intermediate → Advanced → Pro),
 * - today's mode bar (intensity Light/Standard/Intense, Home/Gym, minutes),
 * - age band (recovery, joint-friendly choices) and sex (starting loads from strength standards).
 * Pure: the app (demo + preview) and the server call the same functions.
 */
import type { Experience } from '../progression/initial';
import { generateWorkout, LOAD_STEP, roundLoad, type CatalogExercise, type GeneratedWorkout, type PlannedSet, type TemplateDay, type TemplateSlot, type TrainingContext } from './generator';
import { pct1rm } from './index';

export const LEVELS = ['beginner', 'novice', 'intermediate', 'advanced', 'pro'] as const satisfies readonly Experience[];
export type Intensity = 'light' | 'standard' | 'intense';
export type Where = 'home' | 'gym';
/** training rules use male/female only (docs/plans/TRAIN_REDESIGN.md §4.2) */
export type TrainingSex = 'male' | 'female';
export type AgeBand = 'teen' | '18-29' | '30-39' | '40-49' | '50+';

export interface WorkoutMode {
  intensity: Intensity;
  /** null = the hunter's usual setup */
  where: Where | null;
  /** null = the hunter's usual session length */
  minutes: 20 | 30 | 45 | 60 | null;
}
export const DEFAULT_MODE: WorkoutMode = { intensity: 'standard', where: null, minutes: null };

export interface PersonalContext extends TrainingContext {
  sex?: TrainingSex | null;
  ageYears?: number | null;
}

export const ageBand = (ageYears: number | null | undefined): AgeBand => {
  const a = ageYears ?? 30;
  return a < 18 ? 'teen' : a < 30 ? '18-29' : a < 40 ? '30-39' : a < 50 ? '40-49' : '50+';
};

/* ---------------- level ladder ---------------- */

/** How each level reshapes a template slot (sets, reps, effort). Templates are written at "intermediate". */
const LEVEL: Record<Experience, { setsDelta: Record<'main' | 'secondary' | 'other', number>; maxSets: number; rirFloor: number; heavyRepsFloor: number }> = {
  beginner: { setsDelta: { main: -1, secondary: -1, other: -1 }, maxSets: 3, rirFloor: 3, heavyRepsFloor: 8 },
  novice: { setsDelta: { main: 0, secondary: -1, other: 0 }, maxSets: 3, rirFloor: 2, heavyRepsFloor: 6 },
  intermediate: { setsDelta: { main: 0, secondary: 0, other: 0 }, maxSets: 4, rirFloor: 1, heavyRepsFloor: 5 },
  advanced: { setsDelta: { main: 1, secondary: 0, other: 0 }, maxSets: 5, rirFloor: 1, heavyRepsFloor: 3 },
  pro: { setsDelta: { main: 1, secondary: 1, other: 0 }, maxSets: 6, rirFloor: 0, heavyRepsFloor: 1 },
};

const INTENSITY: Record<Intensity, { setsDelta: number; rirDelta: number; dropFinisher: boolean }> = {
  light: { setsDelta: -1, rirDelta: 1, dropFinisher: true },
  standard: { setsDelta: 0, rirDelta: 0, dropFinisher: false },
  intense: { setsDelta: 1, rirDelta: -1, dropFinisher: false },
};

const roleKey = (r: TemplateSlot['role']) => (r === 'main' ? 'main' : r === 'secondary' ? 'secondary' : 'other');

/** Adapt one template day to level, intensity and age band. */
export function adaptDay(day: TemplateDay, level: Experience, intensity: Intensity, band: AgeBand): TemplateDay {
  const L = LEVEL[level];
  const I = INTENSITY[intensity];
  // an own routine keeps the hunter's sets, reps and effort; only today's Light / Intense choice applies
  if (day.custom) {
    return {
      ...day,
      slots: day.slots.map((s) => ({ ...s, sets: Math.min(10, Math.max(1, s.sets + I.setsDelta)), rir: Math.min(5, Math.max(0, s.rir + I.rirDelta)) })),
    };
  }
  // older hunters keep a rep in reserve on heavy compounds (recovery, joints)
  const ageRir = band === '50+' ? 1 : band === '40-49' ? 1 : band === 'teen' ? 1 : 0;
  const slots = day.slots
    .filter((s) => !(I.dropFinisher && s.role === 'finisher'))
    .map((s): TemplateSlot => {
      const compound = s.role === 'main' || s.role === 'secondary';
      const sets = Math.min(L.maxSets, Math.max(compound ? 2 : 1, s.sets + L.setsDelta[roleKey(s.role)] + I.setsDelta));
      let reps = s.reps;
      if (reps && reps[0] < L.heavyRepsFloor) {
        // beginners/novices never grind low reps: shift the range up, keep its width
        const width = reps[1] - reps[0];
        reps = [L.heavyRepsFloor, L.heavyRepsFloor + Math.max(2, width)];
      }
      const rirAge = compound ? ageRir : band === '50+' ? 1 : 0;
      // the age reserve sits on top of the level floor, so it still applies to beginners
      const rir = Math.max(L.rirFloor, s.rir + I.rirDelta) + rirAge;
      return { ...s, sets, reps, rir };
    });
  return { ...day, slots };
}

/** Deload frequency (weeks) by age band: recovery slows with age. */
export const deloadEveryWeeks = (programDefault: number, band: AgeBand) =>
  band === '50+' ? Math.min(programDefault, 4) : band === '40-49' ? Math.min(programDefault, 5) : programDefault;

/** Extra warm-up minutes by age band. */
export const extraWarmupMinutes = (band: AgeBand) => (band === '50+' ? 4 : band === '40-49' ? 2 : 0);

/** High-impact moves swapped out for 50+ beginners/novices (low-impact alternatives exist for each pattern). */
export const HIGH_IMPACT = ['jump-squat', 'burpee', 'skater-hop', 'high-knees', 'jumping-jack', 'box-jump', 'tuck-jump'];

/* ---------------- home / gym ---------------- */

export const GYM_EQUIPMENT = ['dumbbells', 'bands', 'barbell', 'pull_up_bar', 'bench', 'rack', 'machines', 'cable', 'kettlebell', 'dip_bars'];
const HOME_ITEMS = new Set(['dumbbells', 'bands', 'pull_up_bar', 'kettlebell', 'bench']);

export function equipmentFor(where: Where | null, own: readonly string[]): string[] {
  if (where === 'gym') return GYM_EQUIPMENT;
  if (where === 'home') return own.filter((e) => HOME_ITEMS.has(e));
  return [...own];
}

/* ---------------- strength standards → first-session loads ---------------- */

/**
 * Estimated 1RM as a multiple of bodyweight for barbell lifts, by sex and level (rounded from common
 * strength-standard tables). Used ONLY when the hunter has no history for a lift, and scaled down so the
 * first session errs light; the in-session auto-adjust takes over after the first logged set.
 */
const STANDARD: Record<string, Record<TrainingSex, Record<Experience, number>>> = {
  horizontal_push: { male: { beginner: 0.5, novice: 0.75, intermediate: 1.0, advanced: 1.4, pro: 1.8 }, female: { beginner: 0.3, novice: 0.45, intermediate: 0.65, advanced: 0.9, pro: 1.15 } },
  vertical_push: { male: { beginner: 0.35, novice: 0.5, intermediate: 0.65, advanced: 0.85, pro: 1.05 }, female: { beginner: 0.2, novice: 0.3, intermediate: 0.42, advanced: 0.58, pro: 0.72 } },
  squat: { male: { beginner: 0.75, novice: 1.1, intermediate: 1.45, advanced: 1.9, pro: 2.4 }, female: { beginner: 0.5, novice: 0.75, intermediate: 1.0, advanced: 1.35, pro: 1.75 } },
  hinge: { male: { beginner: 1.0, novice: 1.3, intermediate: 1.7, advanced: 2.2, pro: 2.7 }, female: { beginner: 0.6, novice: 0.9, intermediate: 1.2, advanced: 1.6, pro: 2.0 } },
  horizontal_pull: { male: { beginner: 0.45, novice: 0.65, intermediate: 0.85, advanced: 1.1, pro: 1.35 }, female: { beginner: 0.3, novice: 0.4, intermediate: 0.55, advanced: 0.72, pro: 0.9 } },
  vertical_pull: { male: { beginner: 0.5, novice: 0.7, intermediate: 0.9, advanced: 1.1, pro: 1.3 }, female: { beginner: 0.35, novice: 0.45, intermediate: 0.6, advanced: 0.75, pro: 0.9 } },
};
/** relative to the barbell standard: dumbbells are per hand */
const LOAD_TYPE_FACTOR: Partial<Record<CatalogExercise['loadType'], number>> = { barbell: 1, dumbbell: 0.38, machine: 0.85 };
/** first session errs light */
const FIRST_SESSION_FACTOR = 0.8;

export function standardE1rm(e: CatalogExercise, sex: TrainingSex | null | undefined, level: Experience, bodyweightKg: number, band: AgeBand): number | null {
  const table = STANDARD[e.pattern];
  const factor = LOAD_TYPE_FACTOR[e.loadType];
  if (!table || !factor || !sex) return null;
  // strength standards assume 18–39; scale down gently for older and teenage hunters
  const ageScale = band === '50+' ? 0.85 : band === '40-49' ? 0.93 : band === 'teen' ? 0.85 : 1;
  return table[sex][level] * bodyweightKg * factor * ageScale * FIRST_SESSION_FACTOR;
}

/* ---------------- the one entry point ---------------- */

/**
 * The hunter's own changes to today's workout (preview screen), keyed by the TEMPLATE slot index so
 * they survive mode changes (Light drops the finisher, Time trims accessories) without shifting.
 */
export interface WorkoutEdits {
  /** template slot → exercise id the hunter picked */
  swap?: Record<number, string>;
  /** template slots the hunter removed */
  remove?: number[];
  /** template slots in the hunter's order; slots not listed keep their place at the end */
  order?: number[];
}

export interface PersonalizedWorkout extends GeneratedWorkout {
  mode: WorkoutMode;
  level: Experience;
  ageBand: AgeBand;
  /** template slot index for each exercise (same order as `exercises`), for edits */
  templateSlots: number[];
}

/**
 * Today's workout for this hunter, in this mode. Wraps `generateWorkout` (selection, swaps,
 * time-squeeze) with the level, mode, age and sex rules above.
 */
export function personalizeWorkout(
  day: TemplateDay,
  catalog: readonly CatalogExercise[],
  ctx: PersonalContext,
  mode: WorkoutMode = DEFAULT_MODE,
  edits: WorkoutEdits = {},
): PersonalizedWorkout {
  const band = ageBand(ctx.ageYears);
  const level = ctx.experience;
  // tag every slot with its template index, then drop the ones the hunter removed
  const removed = new Set(edits.remove ?? []);
  const tagged = day.slots.map((s, t) => ({ ...s, t })).filter((s) => !removed.has(s.t));
  // never remove everything: an empty workout isn't a workout
  const kept = tagged.length ? tagged : day.slots.map((s, t) => ({ ...s, t }));
  const adapted = adaptDay({ ...day, slots: kept }, level, mode.intensity, band);
  const tOf = (i: number) => (adapted.slots[i] as TemplateSlot & { t: number }).t;
  const swaps: Record<number, string> = { ...(ctx.swaps ?? {}) };
  adapted.slots.forEach((_, i) => {
    const id = edits.swap?.[tOf(i)];
    if (id) swaps[i] = id;
  });
  const lowImpact = !day.custom && band === '50+' && (level === 'beginner' || level === 'novice');

  // starting loads from strength standards for lifts with no history
  const bestE1rm = { ...(ctx.bestE1rm ?? {}) };
  for (const e of catalog) {
    if (bestE1rm[e.id]) continue;
    const est = standardE1rm(e, ctx.sex, level, ctx.bodyweightKg, band);
    if (est) bestE1rm[e.id] = est;
  }

  // own routines run in full unless the hunter picks a time today
  const minutes = mode.minutes ?? (day.custom ? 240 : ctx.sessionMinutes);
  const workout = generateWorkout(adapted, catalog, {
    ...ctx,
    equipment: equipmentFor(mode.where, ctx.equipment),
    sessionMinutes: Math.max(15, minutes - extraWarmupMinutes(band)),
    bestE1rm,
    swaps,
    avoidExercises: [...(ctx.avoidExercises ?? []), ...(lowImpact ? HIGH_IMPACT : [])],
  });
  let exercises = workout.exercises;
  const order = edits.order ?? [];
  if (order.length) {
    const rank = new Map(order.map((t, i) => [t, i]));
    const r = (i: number) => rank.get(tOf(exercises[i]!.slotIndex)) ?? order.length + i;
    exercises = exercises.map((_, i) => i).sort((a, b) => r(a) - r(b)).map((i) => workout.exercises[i]!);
  }
  return {
    ...workout, exercises, templateSlots: exercises.map((e) => tOf(e.slotIndex)),
    estimatedMinutes: workout.estimatedMinutes + extraWarmupMinutes(band), mode, level, ageBand: band,
  };
}

/* ---------------- promotion ---------------- */

/**
 * Suggest the next level (never forced): ≥ 80% adherence over the last 4 weeks, at least 12 sessions,
 * and main lifts at or above the next level's strength standard (when we know the hunter's sex and lifts).
 */
export function suggestLevelUp(input: {
  level: Experience;
  adherence4w: number;
  sessions4w: number;
  sex?: TrainingSex | null;
  bodyweightKg: number;
  /** best e1RM (kg, barbell-equivalent) per pattern */
  bestByPattern: Partial<Record<keyof typeof STANDARD, number>>;
}): Experience | null {
  const i = LEVELS.indexOf(input.level as (typeof LEVELS)[number]);
  if (i < 0 || i >= LEVELS.length - 1) return null;
  if (input.adherence4w < 0.8 || input.sessions4w < 12) return null;
  const next = LEVELS[i + 1]!;
  if (!input.sex) return next;
  const checks = (Object.keys(input.bestByPattern) as (keyof typeof STANDARD)[]).filter((p) => STANDARD[p]);
  if (!checks.length) return null;
  const meets = checks.filter((p) => (input.bestByPattern[p] ?? 0) >= STANDARD[p]![input.sex!][next] * input.bodyweightKg).length;
  return meets / checks.length >= 0.6 ? next : null;
}

/* ---------------- in-session helpers ---------------- */

/**
 * Suggested working load for an exercise picked mid-session (swap): from the hunter's best e1RM, or from
 * strength standards when there's no history. null for bodyweight/timed work or when sex is unknown.
 */
export function startingLoad(e: CatalogExercise, set: Pick<PlannedSet, 'reps' | 'rir'>, ctx: PersonalContext): number | null {
  if (!set.reps || LOAD_STEP[e.loadType] == null) return null;
  const e1rm = ctx.bestE1rm?.[e.id] ?? standardE1rm(e, ctx.sex, ctx.experience, ctx.bodyweightKg, ageBand(ctx.ageYears));
  if (!e1rm) return null;
  return roundLoad(e1rm * pct1rm(set.reps[1], set.rir), e.loadType);
}

/** A live session untouched this long is treated as abandoned (no 1121-minute timers). */
export const STALE_SESSION_MS = 6 * 3_600_000;
/** Finished workouts can be saved up to this many days back (the server's edit window). */
export const BACKFILL_DAYS = 7;

/**
 * Is a live session stale? If so, it can be finished as of its last logged set (so the game day and
 * duration are honest) or discarded. `canSave` is false with no logged sets or past the edit window.
 */
export function staleSession(startedAt: string, lastActivityAt: string | null, now: Date = new Date()): { stale: boolean; finishAt: string; canSave: boolean } {
  const last = Date.parse(lastActivityAt ?? startedAt);
  const stale = now.getTime() - last > STALE_SESSION_MS;
  // a minute after the last set, never after now
  const finishAt = new Date(Math.min(now.getTime(), last + 60_000)).toISOString();
  const canSave = !!lastActivityAt && now.getTime() - last < BACKFILL_DAYS * 86_400_000 - 3_600_000;
  return { stale, finishAt, canSave };
}
