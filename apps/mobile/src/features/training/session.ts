import { adjustNextLoad, loadFromLoggedSet, REST_SECONDS, type GeneratedWorkout, type PlannedExercise } from '@lb/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { newId } from '@/lib/id';
import { zustandStorage } from '@/lib/storage';
import { exerciseById } from './catalog';

/** Plain-data deep copy (no reliance on structuredClone support in the JS engine). */
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export interface LoggedEntry {
  id: string;
  setIndex: number;
  reps: number | null;
  loadKg: number | null;
  rir: number | null;
  durationS: number | null;
  isWarmup: boolean;
  /** drop set or taken to failure (SYSTEMS.md §3.11) */
  setType?: 'normal' | 'drop' | 'failure';
  completedAt: string;
}

export interface ActiveSession {
  id: string;
  kind: 'program' | 'quick';
  programId: string | null;
  dayId: string | null;
  name: string;
  startedAt: string;
  exercises: PlannedExercise[];
  logs: Record<number, LoggedEntry[]>;
  current: number;
  restUntil: number | null;
  restTotal: number;
  /** short coach note after auto-adjust, e.g. "Felt easy — +2.5 kg next set" */
  coachNote: string | null;
  /** session note typed by the user (debrief) */
  notes?: string | null;
  /** frozen on the first Save tap, so retries (even after the 03:00 rollover) keep the same game day */
  finishedAt?: string | null;
  /** player layout: one exercise at a time (guided) or every exercise as a set table (log) */
  view?: 'guided' | 'log';
}

/** Time of the last logged set (null before the first set). */
export function lastActivityAt(a: ActiveSession): string | null {
  let last: string | null = null;
  for (const list of Object.values(a.logs)) for (const l of list) if (!last || l.completedAt > last) last = l.completedAt;
  return last;
}

interface SessionState {
  active: ActiveSession | null;
  start: (w: GeneratedWorkout, meta: { programId: string | null; dayId: string | null; view?: 'guided' | 'log'; kind?: 'program' | 'quick' }) => void;
  logSet: (exIndex: number, entry: Omit<LoggedEntry, 'id' | 'completedAt'>) => void;
  undoLast: (exIndex: number) => void;
  setLoad: (exIndex: number, setIndex: number, loadKg: number | null) => void;
  /** loadKg: suggested working load for the new exercise (startingLoad), null = pick a weight */
  swap: (exIndex: number, exerciseId: string, loadKg?: number | null) => void;
  /** one more working set like the last one */
  addSet: (exIndex: number) => void;
  /** append an exercise mid-workout (Log mode); loadKg is the suggested working load */
  addExercise: (exerciseId: string, loadKg?: number | null) => void;
  setView: (view: 'guided' | 'log') => void;
  /** finish as of a given time (stale sessions finish at their last set) */
  finishAt: (iso: string) => void;
  go: (index: number) => void;
  startRest: (seconds: number) => void;
  clearRest: () => void;
  end: () => void;
  /** Freezes (once) and returns the finish time of the live session. */
  freezeFinish: () => string;
}

/**
 * The live workout. Persisted to MMKV after every set so a killed app resumes exactly here
 * (ARCHITECTURE.md §6.2). Becomes ONE finish mutation at the end.
 */
export const useWorkoutSession = create<SessionState>()(
  persist(
    (set, get) => ({
      active: null,
      start: (w, meta) =>
        set({
          active: {
            id: newId(), kind: meta.kind ?? 'program', programId: meta.programId, dayId: meta.dayId, name: w.name,
            startedAt: new Date().toISOString(), exercises: clone(w.exercises), logs: {}, current: 0, restUntil: null, restTotal: 0, coachNote: null,
            view: meta.view ?? 'guided',
          },
        }),
      logSet: (exIndex, entry) =>
        set((s) => {
          const a = s.active;
          if (!a) return s;
          const logs = { ...a.logs, [exIndex]: [...(a.logs[exIndex] ?? []), { ...entry, id: newId(), completedAt: new Date().toISOString() }] };
          // Auto-adjust the next unlogged working set's load (PLAN.md §5.8)
          const exercises = clone(a.exercises);
          const pe = exercises[exIndex]!;
          const meta = exerciseById.get(pe.exerciseId);
          const planned = pe.sets[entry.setIndex];
          let coachNote: string | null = null;
          if (meta && planned?.kind === 'working' && planned.reps && entry.reps != null && entry.loadKg != null && entry.rir != null) {
            const next = pe.sets.findIndex((x, i) => i > entry.setIndex && x.kind === 'working');
            if (next >= 0) {
              const target = pe.sets[next]!;
              let load: number | null = null;
              if (planned.loadKg == null && entry.loadKg > 0) {
                load = loadFromLoggedSet({ reps: entry.reps, loadKg: entry.loadKg, rir: entry.rir }, { reps: target.reps!, rir: target.rir }, meta.loadType);
                if (load != null) coachNote = `Next sets: ${load} kg based on that set`;
              } else if (planned.loadKg != null) {
                const adj = adjustNextLoad({ reps: planned.reps, rir: planned.rir, loadKg: entry.loadKg }, { reps: entry.reps, rir: entry.rir }, meta.loadType);
                load = adj.loadKg;
                coachNote = adj.change === 'up' ? `Felt easy, so next set goes up to ${load} kg` : adj.change === 'down' ? `Tough set, so next set eases to ${load} kg` : null;
              }
              if (load != null) for (let i = next; i < pe.sets.length; i++) if (pe.sets[i]!.kind === 'working') pe.sets[i]!.loadKg = load;
            }
          }
          // logging another set reopens the session: the finish time is frozen again on the next Save
          return { active: { ...a, logs, exercises, coachNote, finishedAt: null } };
        }),
      undoLast: (exIndex) =>
        set((s) => (s.active ? { active: { ...s.active, logs: { ...s.active.logs, [exIndex]: (s.active.logs[exIndex] ?? []).slice(0, -1) } } } : s)),
      setLoad: (exIndex, setIndex, loadKg) =>
        set((s) => {
          if (!s.active) return s;
          const exercises = clone(s.active.exercises);
          const st = exercises[exIndex]?.sets[setIndex];
          if (st) st.loadKg = loadKg;
          return { active: { ...s.active, exercises } };
        }),
      addSet: (exIndex) =>
        set((s) => {
          if (!s.active) return s;
          const exercises = clone(s.active.exercises);
          const pe = exercises[exIndex];
          const last = pe?.sets.filter((x) => x.kind === 'working').at(-1) ?? pe?.sets.at(-1);
          if (!pe || !last || pe.sets.length >= 12) return s;
          pe.sets.push({ ...last, kind: 'working' });
          return { active: { ...s.active, exercises } };
        }),
      addExercise: (exerciseId, loadKg = null) =>
        set((s) => {
          if (!s.active) return s;
          const e = exerciseById.get(exerciseId);
          if (!e || s.active.exercises.some((x) => x.exerciseId === exerciseId)) return s;
          // holds (plank, wall-sit, carries) are timed too, not just cardio/mobility
          const timed = e.kind === 'time';
          const role = e.pattern.startsWith('core') ? 'core' as const
            : e.pattern === 'cardio' || e.pattern === 'conditioning' ? 'finisher' as const
            : 'accessory' as const;
          const working = Array.from({ length: 3 }, () => ({
            kind: 'working' as const,
            ...(timed ? { seconds: [30, 45] as [number, number] } : { reps: [8, 12] as [number, number] }),
            rir: 2,
            loadKg: timed ? null : loadKg,
          }));
          const pe: PlannedExercise = {
            slotIndex: s.active.exercises.length,
            exerciseId,
            role,
            restSeconds: REST_SECONDS[e.restType] ?? 75,
            sets: working,
            alternatives: [],
          };
          return { active: { ...s.active, exercises: [...s.active.exercises, pe] } };
        }),
      setView: (view) => set((s) => (s.active ? { active: { ...s.active, view } } : s)),
      finishAt: (iso) => set((s) => (s.active ? { active: { ...s.active, finishedAt: iso } } : s)),
      swap: (exIndex, exerciseId, loadKg = null) =>
        set((s) => {
          if (!s.active) return s;
          const exercises = clone(s.active.exercises);
          const pe = exercises[exIndex]!;
          pe.alternatives = [pe.exerciseId, ...pe.alternatives.filter((x) => x !== exerciseId)];
          pe.exerciseId = exerciseId;
          pe.sets = pe.sets.filter((x) => x.kind === 'working').map((x) => ({ ...x, loadKg }));
          return { active: { ...s.active, exercises, logs: { ...s.active.logs, [exIndex]: [] }, coachNote: null } };
        }),
      go: (index) => set((s) => (s.active ? { active: { ...s.active, current: index, coachNote: null } } : s)),
      startRest: (seconds) => set((s) => (s.active ? { active: { ...s.active, restUntil: Date.now() + seconds * 1000, restTotal: seconds } } : s)),
      clearRest: () => set((s) => (s.active ? { active: { ...s.active, restUntil: null } } : s)),
      end: () => set({ active: null }),
      freezeFinish: () => {
        const a = get().active;
        if (a?.finishedAt) return a.finishedAt;
        const at = new Date().toISOString();
        if (a) set({ active: { ...a, finishedAt: at } });
        return at;
      },
    }),
    { name: 'lb-active-session', storage: createJSONStorage(() => zustandStorage) },
  ),
);
