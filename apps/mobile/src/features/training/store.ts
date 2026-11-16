import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

export interface CompletedWorkout {
  id: string;
  date: string;
  name: string;
  kind: 'program' | 'quick';
  programId: string | null;
  dayId: string | null;
  minutes: number;
  workingSets: number;
  volumeKg: number;
  xp: number;
  prs: { exerciseId: string; e1rmKg: number }[];
}

interface TrainingState {
  activeProgramId: string | null;
  completedSessions: number;
  history: CompletedWorkout[];
  /** best e1RM per exercise (kg) — local mirror of PersonalRecord */
  bestE1rm: Record<string, number>;
  /** pattern → exercise last used, for consistency */
  lastUsed: Record<string, string>;
  /** last working set per exercise, to pre-fill the logger */
  lastSet: Record<string, { reps: number | null; loadKg: number | null }>;
  /** exercises flagged "this hurts" */
  avoid: string[];
  /** XP granted per game date (daily cap, demo mode) */
  xpByDate: Record<string, number>;
  setProgram: (id: string) => void;
  recordWorkout: (w: CompletedWorkout, patch: Partial<Pick<TrainingState, 'bestE1rm' | 'lastUsed' | 'lastSet'>>, advance: boolean) => void;
  addXp: (date: string, xp: number) => void;
  flagPain: (exerciseId: string) => void;
  unflagPain: (exerciseId: string) => void;
}

export const useTraining = create<TrainingState>()(
  persist(
    (set) => ({
      activeProgramId: null,
      completedSessions: 0,
      history: [],
      bestE1rm: {},
      lastUsed: {},
      lastSet: {},
      avoid: [],
      xpByDate: {},
      setProgram: (id) => set((s) => (s.activeProgramId === id ? s : { activeProgramId: id, completedSessions: 0 })),
      recordWorkout: (w, patch, advance) =>
        set((s) => ({
          history: [w, ...s.history].slice(0, 200),
          completedSessions: s.completedSessions + (advance ? 1 : 0),
          bestE1rm: { ...s.bestE1rm, ...patch.bestE1rm },
          lastUsed: { ...s.lastUsed, ...patch.lastUsed },
          lastSet: { ...s.lastSet, ...patch.lastSet },
        })),
      addXp: (date, xp) => set((s) => ({ xpByDate: { ...s.xpByDate, [date]: (s.xpByDate[date] ?? 0) + xp } })),
      flagPain: (id) => set((s) => ({ avoid: s.avoid.includes(id) ? s.avoid : [...s.avoid, id] })),
      unflagPain: (id) => set((s) => ({ avoid: s.avoid.filter((x) => x !== id) })),
    }),
    { name: 'lb-training', storage: createJSONStorage(() => zustandStorage) },
  ),
);
