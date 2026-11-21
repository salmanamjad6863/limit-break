import { focusedById, type FocusedWorkout } from '@lb/content';
import {
  DEFAULT_MODE, GYM_EQUIPMENT, personalizeWorkout, type PersonalContext, type PersonalizedWorkout, type WorkoutEdits, type WorkoutMode,
} from '@lb/engine';
import { useMemo, useState } from 'react';
import { catalog } from './catalog';
import { useTraining } from './store';
import { usePersonalContext, useToday } from './today';

/**
 * The workout a preview is about: today's program day, or a focused workout ("Home Abs").
 * Both run through the same engine (level, sex, age, mode bar, edits); focused ones keep their
 * mode and edits on this screen only and are logged as one-off sessions (they don't move the program).
 */
export interface WorkoutPlan {
  workout: PersonalizedWorkout;
  title: string;
  typeId: string;
  mode: WorkoutMode;
  setMode: (m: WorkoutMode) => void;
  edits: WorkoutEdits;
  setEdits: (e: WorkoutEdits | null) => void;
  start: { kind: 'program' | 'quick'; programId: string | null; dayId: string | null };
  focused: FocusedWorkout | null;
}

export function focusedDay(f: FocusedWorkout) {
  return { id: f.id, name: f.name, focus: 'full' as const, slots: f.slots };
}

/**
 * A focused workout personalised for this hunter. The poster promises its kit ("Dumbbell Chest"), gym ones
 * assume a full gym, and it runs in full (no time cap): posters show the real estimate, and the Time
 * chips on the preview shorten it when the hunter wants.
 */
export function buildFocused(f: FocusedWorkout, ctx: PersonalContext, mode: WorkoutMode = DEFAULT_MODE, edits: WorkoutEdits = {}): PersonalizedWorkout {
  const equipment = f.location === 'GYM' ? GYM_EQUIPMENT : [...new Set([...ctx.equipment, ...f.needs])];
  return personalizeWorkout(focusedDay(f), catalog, { ...ctx, equipment, sessionMinutes: 120 }, mode, edits);
}

export function useWorkoutPlan(focusedId: string | null | undefined, readiness: number | null): WorkoutPlan {
  const today = useToday(readiness);
  const ctx = usePersonalContext(readiness);
  const setTodayMode = useTraining((s) => s.setMode);
  const setTodayEdits = useTraining((s) => s.setEdits);
  const [mode, setMode] = useState<WorkoutMode>(DEFAULT_MODE);
  const [edits, setEdits] = useState<WorkoutEdits>({});
  const f = focusedId ? focusedById.get(focusedId) ?? null : null;

  const focusedWorkout = useMemo(() => (f ? buildFocused(f, ctx, mode, edits) : null), [f, ctx, mode, edits]);

  if (f && focusedWorkout) {
    return {
      workout: focusedWorkout, title: f.name, typeId: f.typeId, mode, setMode, edits,
      setEdits: (e) => setEdits(e ?? {}), start: { kind: 'quick', programId: null, dayId: f.id }, focused: f,
    };
  }
  return {
    workout: today.workout, title: today.program.name, typeId: today.program.typeId, mode: today.mode,
    setMode: (m) => setTodayMode(today.todayIso, m), edits: today.edits,
    setEdits: (e) => setTodayEdits(today.todayIso, today.workout.dayId, e),
    start: { kind: 'program', programId: today.program.id, dayId: today.workout.dayId }, focused: null,
  };
}
