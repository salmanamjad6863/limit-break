/**
 * The hunter's own weekly routine: their days ("Push", "Pull", "Legs"), the exact exercises with
 * their sets, reps or time, rest and supersets, and which weekday each day falls on.
 * A routine runs through the same generator as the built-in programs (load suggestions, warm-up
 * sets, pain/injury swaps, the session player, PRs and XP); only the choice of exercises,
 * sets and reps is the hunter's.
 */
import type { CatalogExercise, SlotRole, TemplateDay, TemplateSlot } from './generator';
import { weekdayOf } from './schedule';

export interface RoutineSlot {
  exerciseId: string;
  sets: number;
  /** exactly one of reps or seconds */
  reps?: [number, number];
  seconds?: [number, number];
  /** reps in reserve on working sets (0 = to failure) */
  rir: number;
  restSeconds?: number;
  /** superset letter ("A"): slots sharing it alternate sets */
  superset?: string | null;
}

export interface RoutineDay {
  id: string;
  name: string;
  slots: RoutineSlot[];
}

export interface Routine {
  /** uuid, client-generated */
  id: string;
  name: string;
  days: RoutineDay[];
  /** weekday (0 = Sunday … 6 = Saturday, as a string key) → day id; unlisted weekdays are rest days */
  schedule: Record<string, string>;
  /** ISO timestamp of the last edit (newest edit wins when phones sync) */
  updatedAt: string;
}

export const ROUTINE_LIMITS = { routines: 20, days: 7, slots: 20, sets: 10, nameLength: 40 } as const;
export const ROUTINE_PREFIX = 'custom-';
/** Routines live alongside the built-in programs under this program id. */
export const routineProgramId = (routineId: string) => `${ROUTINE_PREFIX}${routineId}`;
export const routineIdOf = (programId: string | null | undefined): string | null =>
  programId?.startsWith(ROUTINE_PREFIX) ? programId.slice(ROUTINE_PREFIX.length) : null;

const LOADABLE = new Set(['barbell', 'dumbbell', 'kettlebell', 'machine']);
const LOWER = new Set(['squat', 'squat_iso', 'hinge', 'lunge', 'calf', 'hip_thrust', 'knee_flexion']);

/** Role only drives warm-up sets and default rest: a heavy first lift gets ramp-up sets. */
function roleFor(e: CatalogExercise | undefined, slot: RoutineSlot, index: number): SlotRole {
  if (slot.seconds || e?.kind === 'time') return 'core';
  if (e && LOADABLE.has(e.loadType)) return index === 0 ? 'main' : 'secondary';
  return 'accessory';
}

/** A routine day as a generator day: every slot pinned to the hunter's exercise. */
export function routineDay(day: RoutineDay, catalog: readonly CatalogExercise[]): TemplateDay {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const slots = day.slots.map((s, i): TemplateSlot => {
    const e = byId.get(s.exerciseId);
    return {
      pattern: e?.pattern ?? 'unknown',
      role: roleFor(e, s, i),
      sets: s.sets,
      ...(s.seconds ? { seconds: s.seconds } : { reps: s.reps ?? [8, 12] }),
      rir: s.rir,
      exerciseId: s.exerciseId,
      ...(s.restSeconds ? { restSeconds: s.restSeconds } : {}),
      ...(s.superset ? { superset: s.superset } : {}),
    };
  });
  const lower = slots.filter((s) => LOWER.has(s.pattern)).length;
  const focus = lower === 0 ? 'upper' : lower === slots.length ? 'lower' : 'full';
  return { id: day.id, name: day.name, focus, slots, custom: true };
}

/** Weekdays with a workout, sorted (0 = Sunday). */
export function routineWeekdays(r: Pick<Routine, 'schedule' | 'days'>): number[] {
  const ids = new Set(r.days.map((d) => d.id));
  return Object.entries(r.schedule)
    .filter(([, dayId]) => ids.has(dayId))
    .map(([wd]) => Number(wd))
    .filter((wd) => wd >= 0 && wd <= 6)
    .sort((a, b) => a - b);
}

/**
 * The routine day for a date: the one scheduled on that weekday, or on a rest day the next
 * scheduled one (so "train anyway" does the coming workout). Falls back to the first day.
 */
export function routineDayFor(r: Pick<Routine, 'schedule' | 'days'>, iso: string): { day: RoutineDay; scheduled: boolean } {
  const byId = new Map(r.days.map((d) => [d.id, d]));
  const wd = weekdayOf(iso);
  const today = byId.get(r.schedule[String(wd)] ?? '');
  if (today) return { day: today, scheduled: true };
  for (let k = 1; k <= 7; k++) {
    const next = byId.get(r.schedule[String((wd + k) % 7)] ?? '');
    if (next) return { day: next, scheduled: false };
  }
  return { day: r.days[0]!, scheduled: false };
}

/** Day name planned for each weekday (index 0 = Sunday), null on rest days. */
export function routineWeekNames(r: Pick<Routine, 'schedule' | 'days'>): (string | null)[] {
  const byId = new Map(r.days.map((d) => [d.id, d.name]));
  return Array.from({ length: 7 }, (_, wd) => byId.get(r.schedule[String(wd)] ?? '') ?? null);
}

/** Problems that block saving, in plain words (empty = valid). */
export function routineProblems(r: Pick<Routine, 'name' | 'days' | 'schedule'>, knownExercise: (id: string) => boolean): string[] {
  const out: string[] = [];
  if (!r.name.trim()) out.push('Give the routine a name.');
  if (!r.days.length) out.push('Add at least one day.');
  if (r.days.length > ROUTINE_LIMITS.days) out.push(`At most ${ROUTINE_LIMITS.days} days.`);
  for (const d of r.days) {
    if (!d.name.trim()) out.push('Every day needs a name.');
    if (!d.slots.length) out.push(`${d.name.trim() || 'A day'} has no exercises.`);
    if (d.slots.length > ROUTINE_LIMITS.slots) out.push(`${d.name} has more than ${ROUTINE_LIMITS.slots} exercises.`);
    if (d.slots.some((s) => !knownExercise(s.exerciseId))) out.push(`${d.name} has an exercise that no longer exists.`);
  }
  if (!routineWeekdays(r).length) out.push('Put at least one day on the week.');
  return [...new Set(out)];
}
