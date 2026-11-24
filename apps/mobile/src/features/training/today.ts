import {
  ageOn, DEFAULT_MODE, defaultWeekdays, gameDate, nextDayIndex, personalizeWorkout, routineDay, routineDayFor, routineIdOf, routineWeekdays,
  routineWeekNames, scheduleToday, weekCells,
  type PersonalContext, type PersonalizedWorkout, type ScheduleToday, type WeekCell, type WorkoutEdits, type WorkoutMode,
} from '@lb/engine';
import { useMe } from '@/features/progression/api';
import type { ProgramTemplate } from '@lb/content';
import { useMemo } from 'react';
import { catalog, programById } from './catalog';
import { useTrainingProfile } from './profile';
import { recommendedProgramId } from './recommend';
import { routineAsProgram } from './routines';
import { useTraining } from './store';

export interface Today {
  program: ProgramTemplate;
  /** today is one of the picked weekdays */
  isTrainingDay: boolean;
  dayIndex: number;
  workout: PersonalizedWorkout;
  /** today's mode bar (intensity / home-gym / minutes) */
  mode: WorkoutMode;
  /** the hunter's swaps / removals / order for today (empty when untouched) */
  edits: WorkoutEdits;
  todayIso: string;
  weekdays: number[];
  schedule: ScheduleToday;
  /** Monday-first; past = done / missed / rest, today and later = rotation */
  week: (WeekCell & { label: string })[];
}

const LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Everything the engine needs to personalise a workout for this hunter (level, kit, sex, age, history). */
export function usePersonalContext(readiness: number | null = null): PersonalContext {
  const profile = useTrainingProfile();
  const bestE1rm = useTraining((s) => s.bestE1rm);
  const lastUsed = useTraining((s) => s.lastUsed);
  const avoid = useTraining((s) => s.avoid);
  const birthDate = useMe().data?.nutrition?.birthDate ?? null;
  return useMemo(() => ({
    equipment: profile.equipment, injuries: profile.injuries, experience: profile.experience,
    sessionMinutes: profile.sessionMinutes, bodyweightKg: profile.weightKg, bestE1rm, lastUsed, avoidExercises: avoid, readiness,
    sex: profile.sex === 'unspecified' ? null : profile.sex,
    ageYears: birthDate ? ageOn(birthDate, gameDate(new Date(), profile.timezone || 'UTC')) : null,
  }), [profile, bestE1rm, lastUsed, avoid, readiness, birthDate]);
}

/** Today's planned session from the active (or recommended) program on the user's weekdays — SYSTEMS.md §3.9–3.10. */
export function useToday(readiness: number | null = null): Today {
  const profile = useTrainingProfile();
  const activeId = useTraining((s) => s.activeProgramId);
  const completed = useTraining((s) => s.completedSessions);
  const history = useTraining((s) => s.history);
  const savedMode = useTraining((s) => s.mode);
  const savedEdits = useTraining((s) => s.edits);
  const routines = useTraining((s) => s.routines);
  const ctx = usePersonalContext(readiness);

  return useMemo(() => {
    const rid = routineIdOf(activeId);
    const routine = rid ? routines.find((r) => r.id === rid && r.days.length) : undefined;
    if (routine) {
      // own routine: each weekday has its own day (Mon Push, Wed Pull …); a rest day previews the next one
      const todayIso = gameDate(new Date(), profile.timezone || 'UTC');
      const fixed = routineWeekdays(routine);
      const weekdays = fixed.length ? fixed : profile.weekdays?.length ? profile.weekdays : defaultWeekdays(profile.daysPerWeek);
      const { day: rDay } = routineDayFor(routine, todayIso);
      const day = routineDay(rDay, catalog);
      const dayIndex = Math.max(0, routine.days.findIndex((d) => d.id === rDay.id));
      const mode = savedMode?.date === todayIso ? savedMode.value : DEFAULT_MODE;
      const edits = savedEdits?.date === todayIso && savedEdits.dayId === day.id ? savedEdits.value : {};
      const workout = personalizeWorkout(day, catalog, ctx, mode, edits);
      const done = history.map((h) => ({ date: h.date, kind: h.kind, name: h.name }));
      const schedule = scheduleToday(weekdays, todayIso, done);
      const names = routineWeekNames(routine);
      const week = weekCells(weekdays, todayIso, done, [], 0).map((c) => ({
        ...c, plannedName: !c.past && !c.doneName && c.scheduled ? names[c.weekday] ?? null : c.plannedName, label: LABEL[c.weekday]!,
      }));
      return { program: routineAsProgram(routine), isTrainingDay: schedule.scheduled, dayIndex, workout, mode, edits, todayIso, weekdays, schedule, week };
    }

    const program = programById.get(activeId ?? recommendedProgramId(profile)) ?? programById.get('foundation')!;
    const weekdays = profile.weekdays?.length ? profile.weekdays : defaultWeekdays(profile.daysPerWeek);
    // The training day follows the game day (03:00 rollover, SYSTEMS.md §0), not the calendar.
    const todayIso = gameDate(new Date(), profile.timezone || 'UTC');
    const dayIndex = nextDayIndex(program.days.length, completed);
    const mode = savedMode?.date === todayIso ? savedMode.value : DEFAULT_MODE;
    const day = program.days[dayIndex]!;
    const edits = savedEdits?.date === todayIso && savedEdits.dayId === day.id ? savedEdits.value : {};
    // level, gender, age, today's mode and the hunter's edits shape the session (docs/plans/TRAIN_REDESIGN.md §4)
    const workout = personalizeWorkout(day, catalog, ctx, mode, edits);
    const done = history.map((h) => ({ date: h.date, kind: h.kind, name: h.name }));
    const schedule = scheduleToday(weekdays, todayIso, done);
    const week = weekCells(weekdays, todayIso, done, program.days.map((d) => d.name), dayIndex).map((c) => ({ ...c, label: LABEL[c.weekday]! }));
    return { program, isTrainingDay: schedule.scheduled, dayIndex, workout, mode, edits, todayIso, weekdays, schedule, week };
  }, [profile, activeId, completed, ctx, history, savedMode, savedEdits, routines]);
}
