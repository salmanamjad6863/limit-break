import type { FitnessTests } from '@lb/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

export interface LocalAttempt {
  id: string;
  target: 'D' | 'C' | 'B' | 'A' | 'S';
  at: string;
  passed: boolean;
  composite: number;
  setting: 'HOME' | 'GYM';
}

/**
 * Demo/offline mirror of progression data the server keeps (assessment + trial tests,
 * trial attempts, calisthenics levels). With a backend, the server is authoritative.
 */
interface ProgressState {
  tests: FitnessTests;
  attempts: LocalAttempt[];
  /** chain id (first exercise in the chain) → highest level reached (1-based) */
  calLevels: Record<string, number>;
  mergeTests: (t: FitnessTests) => void;
  addAttempt: (a: LocalAttempt) => void;
  bumpCalLevels: (levels: Record<string, number>) => void;
  reset: () => void;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      tests: {},
      attempts: [],
      calLevels: {},
      mergeTests: (t) =>
        set((s) => ({ tests: { ...s.tests, ...Object.fromEntries(Object.entries(t).filter(([, v]) => v != null)) } })),
      addAttempt: (a) => set((s) => ({ attempts: [a, ...s.attempts].slice(0, 50) })),
      bumpCalLevels: (levels) =>
        set((s) => {
          const next = { ...s.calLevels };
          for (const [k, v] of Object.entries(levels)) next[k] = Math.max(next[k] ?? 0, v);
          return { calLevels: next };
        }),
      reset: () => set({ tests: {}, attempts: [], calLevels: {} }),
    }),
    { name: 'lb-progress', storage: createJSONStorage(() => zustandStorage) },
  ),
);
