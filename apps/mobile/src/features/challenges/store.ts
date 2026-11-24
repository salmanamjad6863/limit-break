/**
 * Habit challenges on this phone: the source the screens read. Signed in, the server copy is merged in
 * (api.ts); in demo mode this is all there is. `rewarded` mirrors the server's pay-once rule for demo XP.
 */
import type { ChallengeDto } from '@lb/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

interface ChallengeState {
  challenges: ChallengeDto[];
  /** demo mode: challenge id → dates already paid */
  rewarded: Record<string, string[]>;
  set: (fn: (s: { challenges: ChallengeDto[]; rewarded: Record<string, string[]> }) => Partial<{ challenges: ChallengeDto[]; rewarded: Record<string, string[]> }>) => void;
}

export const useChallengeStore = create<ChallengeState>()(
  persist(
    (set) => ({
      challenges: [],
      rewarded: {},
      set: (fn) => set((s) => fn(s)),
    }),
    { name: 'lb-challenges', storage: createJSONStorage(() => zustandStorage), partialize: (s) => ({ challenges: s.challenges, rewarded: s.rewarded }) },
  ),
);
