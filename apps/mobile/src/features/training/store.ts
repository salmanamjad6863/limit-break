import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

export interface CompletedSet {
  id: string;
  exerciseId: string;
  reps: number | null;
  loadKg: number | null;
  rir: number | null;
  durationS: number | null;
  isWarmup: boolean;
  setType: 'normal' | 'drop' | 'failure';
}

export interface CompletedWorkout {
  id: string;
  date: string;
  name: string;
  kind: 'program' | 'quick' | 'manual';
  /** app = logged live; manual = logged afterwards (unverified) */
  source?: 'app' | 'manual';
  sets?: CompletedSet[];
  notes?: string | null;
  sessionRpe?: number | null;
  plannedHardSets?: number;
  cardioMinutes?: number;
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
  /** sticky per-exercise notes (SYSTEMS.md §3.11) */
  notes: Record<string, string>;
  setNote: (exerciseId: string, note: string) => void;
  /** history edits (demo mode; the server is authoritative when signed in) */
  updateWorkout: (id: string, patch: Partial<CompletedWorkout>) => void;
  removeWorkout: (id: string) => void;
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
      notes: {},
      setNote: (id, note) =>
        set((s) => {
          const notes = { ...s.notes };
          if (note.trim()) notes[id] = note.trim();
          else delete notes[id];
          return { notes };
        }),
      updateWorkout: (id, patch) => set((s) => ({ history: s.history.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),
      removeWorkout: (id) =>
        set((s) => {
          const w = s.history.find((h) => h.id === id);
          return {
            history: s.history.filter((h) => h.id !== id),
            // a deleted program session no longer advances the rotation
            completedSessions: w?.kind === 'program' ? Math.max(0, s.completedSessions - 1) : s.completedSessions,
            xpByDate: w ? { ...s.xpByDate, [w.date]: Math.max(0, (s.xpByDate[w.date] ?? 0) - w.xp) } : s.xpByDate,
          };
        }),
    }),
    { name: 'lb-training', storage: createJSONStorage(() => zustandStorage) },
  ),
);
