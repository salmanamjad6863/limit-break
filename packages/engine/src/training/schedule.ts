/**
 * Weekly schedule, rest days and missed workouts — SYSTEMS.md §3.10.
 * Weekdays use JS numbering (0 = Sunday … 6 = Saturday); weeks are Monday-first.
 */
import { TRAINING_WEEKDAYS } from './generator';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const DAY = 86_400_000;
const MONDAY_FIRST: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const weekdayOf = (iso: string): Weekday => new Date(`${iso}T12:00:00Z`).getUTCDay() as Weekday;

/** Default weekdays for a days-per-week count (Mon/Wed/Fri for 3, …). */
export const defaultWeekdays = (daysPerWeek: number): Weekday[] => [...(TRAINING_WEEKDAYS[daysPerWeek] ?? TRAINING_WEEKDAYS[3]!)] as Weekday[];

export type ScheduleWarning = 'countNotSupported' | 'tooManyInARow' | 'noRestDay';

/**
 * Checks a user's picked weekdays against the program: count must be one it supports;
 * more than 2 days in a row (3 for split programs) and zero rest days are flagged.
 */
export function validateWeekdays(weekdays: readonly number[], programDaysPerWeek: readonly number[], split: boolean): ScheduleWarning[] {
  const w: ScheduleWarning[] = [];
  const set = new Set(weekdays);
  if (!programDaysPerWeek.includes(set.size)) w.push('countNotSupported');
  if (set.size >= 7) w.push('noRestDay');
  // longest run of consecutive training days, wrapping Sunday → Monday
  let run = 0;
  let best = 0;
  for (const d of [...MONDAY_FIRST, ...MONDAY_FIRST]) {
    run = set.has(d) ? run + 1 : 0;
    best = Math.max(best, Math.min(run, 7));
  }
  if (best > (split ? 3 : 2)) w.push('tooManyInARow');
  return w;
}

export interface DoneSession {
  date: string;
  kind: 'program' | 'quick' | 'manual';
}

export interface ScheduleToday {
  /** today is one of the picked weekdays */
  scheduled: boolean;
  /** a program workout was already done today */
  doneToday: boolean;
  /** scheduled days earlier this week with no program workout made up since */
  missedThisWeek: number;
  /** program workouts this week on unscheduled days (capped at 2) */
  makeupsThisWeek: number;
  /** rest day, but a missed workout may be made up today (48 h rule + 2-make-ups cap) */
  canTrainInstead: boolean;
}

/** What today is, given the schedule and what was actually done (§3.10 rules). */
export function scheduleToday(weekdays: readonly number[], today: string, done: readonly DoneSession[]): ScheduleToday {
  const set = new Set(weekdays);
  const t = dayNum(today);
  const monday = t - MONDAY_FIRST.indexOf(weekdayOf(today));
  const program = done.filter((d) => d.kind === 'program');
  const inWeek = (iso: string) => dayNum(iso) >= monday && dayNum(iso) < t;
  const scheduledBefore = MONDAY_FIRST.slice(0, t - monday).filter((d) => set.has(d)).length;
  const doneBefore = program.filter((d) => inWeek(d.date)).length;
  const makeupsThisWeek = Math.min(2, program.filter((d) => inWeek(d.date) && !set.has(weekdayOf(d.date))).length);
  const missedThisWeek = Math.max(0, scheduledBefore - doneBefore);
  const doneToday = program.some((d) => d.date === today);
  const yesterday = isoOf(t - 1);
  const hardYesterday = program.some((d) => d.date === yesterday);
  const scheduled = set.has(weekdayOf(today));
  return {
    scheduled, doneToday, missedThisWeek, makeupsThisWeek,
    canTrainInstead: !scheduled && !doneToday && missedThisWeek > 0 && makeupsThisWeek < 2 && !hardYesterday,
  };
}

export interface WeekCell {
  date: string;
  weekday: Weekday;
  isToday: boolean;
  past: boolean;
  /** what was done that day (program workout name), if anything */
  doneName: string | null;
  /** planned program day name for today/future training days */
  plannedName: string | null;
  scheduled: boolean;
  missed: boolean;
}

/**
 * Monday-first week: past days show what happened (done / missed / rest); today and later show
 * upcoming workouts in rotation. Missed days never skip a workout — the rotation simply continues.
 */
export function weekCells(
  weekdays: readonly number[], today: string, done: readonly (DoneSession & { name: string })[], dayNames: readonly string[], nextIndex: number,
): WeekCell[] {
  const set = new Set(weekdays);
  const t = dayNum(today);
  const monday = t - MONDAY_FIRST.indexOf(weekdayOf(today));
  let k = nextIndex;
  return MONDAY_FIRST.map((wd, i) => {
    const date = isoOf(monday + i);
    const n = monday + i;
    const did = done.find((d) => d.kind === 'program' && d.date === date) ?? null;
    const scheduled = set.has(wd);
    if (n < t) return { date, weekday: wd, isToday: false, past: true, doneName: did?.name ?? null, plannedName: null, scheduled, missed: scheduled && !did };
    if (n === t && did) return { date, weekday: wd, isToday: true, past: false, doneName: did.name, plannedName: null, scheduled, missed: false };
    const plannedName = scheduled && dayNames.length ? dayNames[k++ % dayNames.length]! : null;
    return { date, weekday: wd, isToday: n === t, past: false, doneName: null, plannedName, scheduled, missed: false };
  });
}

/** Next local reminder times: `workoutTime − 30 min` on each scheduled weekday (§3.10). */
export function reminderSlots(weekdays: readonly number[], workoutTime: string): { weekday: Weekday; hour: number; minute: number }[] {
  const [h, m] = workoutTime.split(':').map(Number) as [number, number];
  let total = h * 60 + m - 30;
  const shift = total < 0 ? -1 : 0;
  total = (total + 1440) % 1440;
  return [...new Set(weekdays)].sort().map((d) => ({ weekday: (((d + shift) % 7) + 7) % 7 as Weekday, hour: Math.floor(total / 60), minute: total % 60 }));
}
