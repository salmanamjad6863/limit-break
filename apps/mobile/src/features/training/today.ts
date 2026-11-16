import { gameDate, generateWorkout, isTrainingDay, nextDayIndex, TRAINING_WEEKDAYS, type GeneratedWorkout } from '@lb/engine';
import type { ProgramTemplate } from '@lb/content';
import { useMemo } from 'react';
import { catalog, programById } from './catalog';
import { useTrainingProfile } from './profile';
import { recommendedProgramId } from './recommend';
import { useTraining } from './store';

export interface Today {
  program: ProgramTemplate;
  isTrainingDay: boolean;
  dayIndex: number;
  workout: GeneratedWorkout;
  /**
   * Monday-first. Past days show what was actually done (or nothing); today and later show the
   * upcoming program days in rotation from the user's current position.
   */
  week: { weekday: string; dayName: string | null; isToday: boolean; past: boolean; done: boolean }[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Today's planned session from the active (or recommended) program — SYSTEMS.md §3.9. */
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
    const daysPerWeek = program.daysPerWeek.includes(profile.daysPerWeek)
      ? profile.daysPerWeek
      : program.daysPerWeek.reduce((a, b) => (Math.abs(b - profile.daysPerWeek) < Math.abs(a - profile.daysPerWeek) ? b : a));
    // The training day follows the game day (03:00 rollover, SYSTEMS.md §0), not the calendar.
    const todayIso = gameDate(new Date(), profile.timezone || 'UTC');
    const todayDate = new Date(`${todayIso}T12:00:00`);
    const weekday = todayDate.getDay();
    const dayIndex = nextDayIndex(program.days.length, completed);
    const workout = generateWorkout(program.days[dayIndex]!, catalog, {
      equipment: profile.equipment, injuries: profile.injuries, experience: profile.experience,
      sessionMinutes: profile.sessionMinutes, bodyweightKg: profile.weightKg, bestE1rm, lastUsed, avoidExercises: avoid, readiness,
    });
    const train = TRAINING_WEEKDAYS[daysPerWeek] ?? TRAINING_WEEKDAYS[3]!;
    const todayPos = (weekday + 6) % 7;
    const monday = new Date(todayDate);
    monday.setDate(monday.getDate() - todayPos);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let k = dayIndex;
    const week = WEEKDAYS.map((label, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const jsDay = (i + 1) % 7;
      if (i < todayPos) {
        const did = history.find((h) => h.date === iso(date) && h.kind === 'program');
        return { weekday: label, dayName: did?.name ?? null, isToday: false, past: true, done: !!did };
      }
      const doneToday = i === todayPos ? history.find((h) => h.date === iso(date) && h.kind === 'program') : undefined;
      if (doneToday) return { weekday: label, dayName: doneToday.name, isToday: true, past: false, done: true };
      const planned = train.includes(jsDay) ? program.days[k++ % program.days.length]!.name : null;
      return { weekday: label, dayName: planned, isToday: i === todayPos, past: false, done: false };
    });
    return { program, isTrainingDay: isTrainingDay(daysPerWeek, weekday), dayIndex, workout, week };
  }, [profile, activeId, completed, bestE1rm, lastUsed, avoid, readiness, history]);
}
