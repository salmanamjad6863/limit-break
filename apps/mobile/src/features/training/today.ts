import {
  defaultWeekdays, gameDate, generateWorkout, nextDayIndex, scheduleToday, weekCells, type GeneratedWorkout, type ScheduleToday, type WeekCell,
} from '@lb/engine';
import type { ProgramTemplate } from '@lb/content';
import { useMemo } from 'react';
import { catalog, programById } from './catalog';
import { useTrainingProfile } from './profile';
import { recommendedProgramId } from './recommend';
import { useTraining } from './store';

export interface Today {
  program: ProgramTemplate;
  /** today is one of the picked weekdays */
  isTrainingDay: boolean;
  dayIndex: number;
  workout: GeneratedWorkout;
  weekdays: number[];
  schedule: ScheduleToday;
  /** Monday-first; past = done / missed / rest, today and later = rotation */
  week: (WeekCell & { label: string })[];
}

const LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Today's planned session from the active (or recommended) program on the user's weekdays — SYSTEMS.md §3.9–3.10. */
export function useToday(readiness: number | null = null): Today {
  const profile = useTrainingProfile();
  const activeId = useTraining((s) => s.activeProgramId);
  const completed = useTraining((s) => s.completedSessions);
  const bestE1rm = useTraining((s) => s.bestE1rm);
  const lastUsed = useTraining((s) => s.lastUsed);
  const avoid = useTraining((s) => s.avoid);
  const history = useTraining((s) => s.history);

  return useMemo(() => {
    const program = programById.get(activeId ?? recommendedProgramId(profile)) ?? programById.get('foundation')!;
    const weekdays = profile.weekdays?.length ? profile.weekdays : defaultWeekdays(profile.daysPerWeek);
    // The training day follows the game day (03:00 rollover, SYSTEMS.md §0), not the calendar.
    const todayIso = gameDate(new Date(), profile.timezone || 'UTC');
    const dayIndex = nextDayIndex(program.days.length, completed);
    const workout = generateWorkout(program.days[dayIndex]!, catalog, {
      equipment: profile.equipment, injuries: profile.injuries, experience: profile.experience,
      sessionMinutes: profile.sessionMinutes, bodyweightKg: profile.weightKg, bestE1rm, lastUsed, avoidExercises: avoid, readiness,
    });
    const done = history.map((h) => ({ date: h.date, kind: h.kind, name: h.name }));
    const schedule = scheduleToday(weekdays, todayIso, done);
    const week = weekCells(weekdays, todayIso, done, program.days.map((d) => d.name), dayIndex).map((c) => ({ ...c, label: LABEL[c.weekday]! }));
    return { program, isTrainingDay: schedule.scheduled, dayIndex, workout, weekdays, schedule, week };
  }, [profile, activeId, completed, bestE1rm, lastUsed, avoid, history, readiness]);
}
