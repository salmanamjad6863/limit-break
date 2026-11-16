import type { Assessment, OnboardingInput } from '@lb/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

export type Draft = Partial<OnboardingInput> & { ageYears?: number };
export type Units = 'metric' | 'imperial';

interface OnboardingState {
  step: number;
  draft: Draft;
  units: Units;
  set: (patch: Draft) => void;
  setAssessment: (patch: Partial<Assessment> | null) => void;
  setUnits: (u: Units) => void;
  go: (step: number) => void;
  reset: () => void;
}

const DEFAULT_DRAFT: Draft = {
  equipment: [],
  injuries: [],
  daysPerWeek: 4,
  sessionMinutes: 45,
  questTime: '07:00',
  heightCm: 175,
  weightKg: 75,
  bodyFatPct: null,
  ageYears: 24,
  fatPreference: 'balanced',
  nutritionMode: 'full',
  assessment: null,
  notificationsOptIn: false,
  parqAnyYes: false,
};

/** Persisted so a killed app resumes the Awakening where the user left it. */
export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      step: 0,
      draft: DEFAULT_DRAFT,
      units: 'metric',
      set: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
      setAssessment: (patch) =>
        set((s) => ({
          draft: {
            ...s.draft,
            assessment:
              patch === null ? null : { pushups: 0, plankSec: 0, squats60: 0, ...s.draft.assessment, ...patch },
          },
        })),
      setUnits: (units) => set({ units }),
      go: (step) => set({ step }),
      reset: () => set({ step: 0, draft: DEFAULT_DRAFT, units: 'metric' }),
    }),
    { name: 'lb-onboarding', storage: createJSONStorage(() => zustandStorage) },
  ),
);

/** Birth date from an age (Jan 1 keeps it non-identifying; we only need age bands). */
export const birthDateFromAge = (age: number, now = new Date()) => `${now.getUTCFullYear() - age}-01-01`;
