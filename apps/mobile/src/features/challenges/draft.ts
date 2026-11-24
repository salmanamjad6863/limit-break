/** The challenge being built, shared by the builder and its exercise picker (memory only). */
import type { CreateChallengeInput } from '@lb/contracts';
import { create } from 'zustand';

interface DraftState {
  draft: CreateChallengeInput | null;
  begin: (d: CreateChallengeInput) => void;
  update: (fn: (d: CreateChallengeInput) => CreateChallengeInput) => void;
  clear: () => void;
}

export const useChallengeDraft = create<DraftState>()((set) => ({
  draft: null,
  begin: (draft) => set({ draft }),
  update: (fn) => set((s) => (s.draft ? { draft: fn(s.draft) } : s)),
  clear: () => set({ draft: null }),
}));
