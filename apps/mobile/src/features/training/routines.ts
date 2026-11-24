/**
 * The hunter's own weekly routines: instant on the phone, saved to the account when signed in
 * (newest edit wins across phones), and usable anywhere a program is (today's workout, week strip,
 * the session player, history).
 */
import type { ProgramTemplate } from '@lb/content';
import type { TrainingSettingsInput } from '@lb/contracts';
import { personalizeWorkout, routineDay, routineIdOf, routineProgramId, routineWeekdays, type PersonalContext, type Routine, type RoutineDay } from '@lb/engine';
import { useMutation } from '@tanstack/react-query';
import { useSession } from '@/features/session/store';
import { catalog, exerciseById } from './catalog';
import { useTrainingProfile } from './profile';
import { useUpdateTraining } from './settings';
import { routineDeleteKey, routineSaveKey, useSetProgram } from './sync';
import { useTraining } from './store';

export const useRoutines = () => useTraining((s) => s.routines);
export const useRoutine = (id: string | null | undefined) => useTraining((s) => (id ? s.routines.find((r) => r.id === id) ?? null : null));

/** A routine as a program, for screens that show "the active program" (name, type, day names). */
export function routineAsProgram(r: Routine): ProgramTemplate {
  const days = r.days.length;
  return {
    id: routineProgramId(r.id), name: r.name, typeId: 'strength',
    summary: `Your routine · ${r.days.map((d) => d.name).join(' · ')}`,
    levels: ['beginner', 'novice', 'intermediate', 'advanced', 'pro'], locations: ['HOME', 'GYM', 'HYBRID'], goals: ['cut', 'maintain', 'recomp', 'bulk'],
    daysPerWeek: [Math.min(6, Math.max(2, routineWeekdays(r).length || days))], blockWeeks: 8, deloadEvery: 6,
    // the generator reads days through routineDay(); these keep ProgramTemplate's shape for display (name, focus)
    days: r.days.map((d) => ({ id: d.id, name: d.name, focus: routineDay(d, catalog).focus, slots: [] as ProgramTemplate['days'][number]['slots'] })),
  };
}

export const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/** Short, url-safe day id from its name, unique within the routine. */
export function dayIdFor(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'day';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/** A new empty day; the editor fills it. */
export const blankDay = (name: string, taken: readonly string[]): RoutineDay => ({ id: dayIdFor(name, taken), name, slots: [] });

/** Sensible starting targets for an exercise the hunter adds (they can change every number). */
export function defaultSlot(exerciseId: string): RoutineDay['slots'][number] {
  const e = exerciseById.get(exerciseId);
  if (e?.kind === 'time') return { exerciseId, sets: 3, seconds: [30, 45], rir: 2 };
  const heavy = e && ['barbell', 'machine'].includes(e.loadType);
  return { exerciseId, sets: 3, reps: heavy ? [6, 10] : [8, 12], rir: 2 };
}

export function useRoutineActions() {
  const status = useSession((s) => s.status);
  const upsert = useTraining((s) => s.upsertRoutine);
  const remove = useTraining((s) => s.removeRoutine);
  const activeId = useTraining((s) => s.activeProgramId);
  const setProgram = useSetProgram();
  const updateTraining = useUpdateTraining();
  const profile = useTrainingProfile();
  const save = useMutation<unknown, Error, Routine>({ mutationKey: routineSaveKey });
  const del = useMutation<unknown, Error, string>({ mutationKey: routineDeleteKey });

  /** the routine's weekdays become the training days (reminders, rest days, quests follow them) */
  const syncWeekdays = (r: Routine, nextWorkout: string) => {
    const weekdays = routineWeekdays(r);
    // the account's training days are 2–6 a week; a 1- or 7-day routine still runs on its own schedule
    if (weekdays.length < 2 || weekdays.length > 6) return;
    const input: TrainingSettingsInput = {
      experience: profile.experience, location: profile.location, equipment: profile.equipment, injuries: profile.injuries,
      sessionMinutes: ([15, 30, 45, 60, 75, 90].includes(profile.sessionMinutes) ? profile.sessionMinutes : 45) as TrainingSettingsInput['sessionMinutes'],
      weekdays, workoutTime: profile.workoutTime ?? null,
    };
    updateTraining.mutate({ input, nextWorkout });
  };

  return {
    save: (r: Routine) => {
      const stamped = { ...r, updatedAt: new Date().toISOString() };
      upsert(stamped);
      if (status === 'signedIn') save.mutate(stamped);
      if (routineIdOf(activeId) === r.id) syncWeekdays(stamped, stamped.days[0]?.name ?? r.name);
      return stamped;
    },
    remove: (id: string) => {
      remove(id);
      if (status === 'signedIn') del.mutate(id);
    },
    /** use this routine as the plan from today */
    activate: (r: Routine) => {
      setProgram(routineProgramId(r.id));
      syncWeekdays(r, r.days[0]?.name ?? r.name);
    },
  };
}

/**
 * A built-in program as an editable routine, at the hunter's level: the exercises they would get
 * today become fixed picks, and program days land on their training weekdays in order.
 */
export function routineFromProgram(p: ProgramTemplate, ctx: PersonalContext, weekdays: readonly number[]): Routine {
  const days: RoutineDay[] = p.days.map((d) => {
    const w = personalizeWorkout(d, catalog, { ...ctx, sessionMinutes: 120 });
    return {
      id: d.id, name: d.name,
      slots: w.exercises.map((e) => {
        const work = e.sets.filter((s) => s.kind === 'working');
        const first = work[0];
        return {
          exerciseId: e.exerciseId, sets: Math.max(1, work.length), rir: first?.rir ?? 2, restSeconds: e.restSeconds,
          ...(first?.seconds ? { seconds: first.seconds } : { reps: first?.reps ?? [8, 12] }),
          ...(e.supersetGroup ? { superset: e.supersetGroup } : {}),
        };
      }),
    };
  });
  // Monday-first order so "Day A" lands on the first training day of the week
  const ordered = [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const schedule: Record<string, string> = {};
  ordered.forEach((wd, i) => {
    schedule[String(wd)] = days[i % days.length]!.id;
  });
  return { id: newId(), name: `My ${p.name}`.slice(0, 40), days, schedule, updatedAt: new Date().toISOString() };
}
