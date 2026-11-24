/**
 * Habit challenges ("60-day push-up challenge"): the hunter picks a length, a few daily tasks
 * (exercises with a target that can ramp up, or simple habits) and the challenge runs on game days.
 *
 * Always flexible: a missed day never restarts the challenge. Grace days cover the first few misses
 * (like streak shields); later misses only push the finish date back, because the challenge ends when
 * `days` days are counted (completed + covered by grace).
 */
import { addDays } from './index';

export type ChallengeUnit = 'reps' | 'sec' | 'min';

export interface ChallengeTask {
  /** stable within the challenge ("t1") */
  id: string;
  kind: 'exercise' | 'habit';
  /** exercise tasks: shown as "<target> <unit> <exercise>" */
  exerciseId?: string;
  /** habit tasks: "Drink 3 L water"; exercise tasks: optional custom label */
  title: string;
  target?: number;
  unit?: ChallengeUnit;
  /** ramp: add this much every `stepDays` days (0 = same target every day) */
  addPerStep?: number;
  stepDays?: number;
}

export interface Challenge {
  id: string;
  name: string;
  days: number;
  graceDays: number;
  /** game date of day 1 */
  startDate: string;
  tasks: ChallengeTask[];
  status: 'ACTIVE' | 'COMPLETED' | 'ENDED';
}

/** task ids done, per game date */
export type ChallengeCheckins = Record<string, string[]>;

export const CHALLENGE_LIMITS = { tasks: 8, minDays: 3, maxDays: 365, maxActive: 3, maxGrace: 30 } as const;
export const CHALLENGE_LENGTHS = [21, 30, 60, 75, 90] as const;
/** Default grace: about one day in ten (60 days → 6). */
export const defaultGraceDays = (days: number) => Math.min(CHALLENGE_LIMITS.maxGrace, Math.max(1, Math.round(days / 10)));

const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / 86_400_000);
/** 1-based day number of a date in the challenge (can be ≤ 0 before it starts). */
export const challengeDayNumber = (c: Pick<Challenge, 'startDate'>, date: string) => dayNum(date) - dayNum(c.startDate) + 1;

/** Today's target for a task on day `n` (exercise tasks; habits have none). */
export function taskTarget(t: ChallengeTask, n: number): number | null {
  if (t.kind !== 'exercise' || t.target == null) return null;
  const step = Math.max(1, t.stepDays ?? 1);
  return t.target + Math.max(0, t.addPerStep ?? 0) * Math.floor(Math.max(0, n - 1) / step);
}

export type ChallengeDayState = 'done' | 'grace' | 'missed' | 'today' | 'future' | 'partial';

export interface ChallengeProgress {
  /** day number today (1-based; clamped to the calendar span) */
  dayNumber: number;
  completedDays: number;
  misses: number;
  graceUsed: number;
  graceLeft: number;
  /** completed + grace-covered days, toward `days` */
  counted: number;
  finished: boolean;
  /** game date the challenge ends on if every day from now is done (null when finished) */
  projectedEnd: string | null;
  todayDone: boolean;
  /** missed no day at all */
  flawless: boolean;
  /** one entry per day from the start to the projected end (or the finish day) */
  calendar: { date: string; n: number; state: ChallengeDayState }[];
}

const isFull = (c: Challenge, done: readonly string[] | undefined) => !!done && c.tasks.length > 0 && c.tasks.every((t) => done.includes(t.id));

export function challengeProgress(c: Challenge, checkins: ChallengeCheckins, today: string): ChallengeProgress {
  const calendar: ChallengeProgress['calendar'] = [];
  let completedDays = 0;
  let misses = 0;
  let finishedOn: string | null = null;
  const todayN = challengeDayNumber(c, today);
  // walk the past (and today) until the challenge is counted out
  for (let n = 1; n <= Math.max(0, todayN); n++) {
    const date = addDays(c.startDate, n - 1);
    const full = isFull(c, checkins[date]);
    let state: ChallengeDayState;
    if (full) {
      completedDays++;
      state = 'done';
    } else if (date === today) {
      state = (checkins[date]?.length ?? 0) > 0 ? 'partial' : 'today';
    } else {
      misses++;
      state = misses <= c.graceDays ? 'grace' : 'missed';
    }
    calendar.push({ date, n, state });
    if (completedDays + Math.min(misses, c.graceDays) >= c.days) {
      finishedOn = date;
      break;
    }
  }
  const graceUsed = Math.min(misses, c.graceDays);
  const counted = Math.min(c.days, completedDays + graceUsed);
  const finished = c.status === 'COMPLETED' || !!finishedOn;
  const todayDone = isFull(c, checkins[today]);
  const left = c.days - counted;
  // the remaining days run from today (or from tomorrow when today is already done)
  const projectedEnd = finished ? null : todayN < 1 ? addDays(c.startDate, c.days - 1) : addDays(today, todayDone ? left : left - 1);
  if (!finished) {
    const from = Math.max(1, todayN + 1);
    const lastN = todayN < 1 ? c.days : from + (todayDone ? left : left - 1) - 1;
    for (let n = from; n <= lastN; n++) calendar.push({ date: addDays(c.startDate, n - 1), n, state: 'future' });
  }
  return {
    dayNumber: Math.max(1, Math.min(todayN, calendar.length || 1)),
    completedDays, misses, graceUsed, graceLeft: Math.max(0, c.graceDays - misses), counted, finished, projectedEnd, todayDone,
    flawless: misses === 0, calendar,
  };
}

/** Problems that block creating a challenge, in plain words (empty = valid). */
export function challengeProblems(c: Pick<Challenge, 'name' | 'days' | 'graceDays' | 'tasks'>, knownExercise: (id: string) => boolean): string[] {
  const out: string[] = [];
  if (!c.name.trim()) out.push('Give the challenge a name.');
  if (c.days < CHALLENGE_LIMITS.minDays || c.days > CHALLENGE_LIMITS.maxDays) out.push(`Pick ${CHALLENGE_LIMITS.minDays}–${CHALLENGE_LIMITS.maxDays} days.`);
  if (c.graceDays < 0 || c.graceDays > Math.min(CHALLENGE_LIMITS.maxGrace, c.days - 1)) out.push('Too many grace days for this length.');
  if (!c.tasks.length) out.push('Add at least one daily task.');
  if (c.tasks.length > CHALLENGE_LIMITS.tasks) out.push(`At most ${CHALLENGE_LIMITS.tasks} tasks.`);
  for (const t of c.tasks) {
    if (t.kind === 'habit' && !t.title.trim()) out.push('Every habit needs a name.');
    if (t.kind === 'exercise' && (!t.exerciseId || !knownExercise(t.exerciseId))) out.push('An exercise task has no valid exercise.');
    if (t.kind === 'exercise' && !(t.target && t.target > 0)) out.push('Exercise tasks need a daily target.');
  }
  return [...new Set(out)];
}

/** XP: a small amount per fully done day (once), and a finish bonus that grows with the length. */
export const CHALLENGE_XP = { day: 10, finish: (days: number) => Math.min(250, 50 + 2 * days), flawlessBonus: 50 } as const;
