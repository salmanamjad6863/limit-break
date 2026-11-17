import type { QuestDto } from '@lb/contracts';
import { newStreakState, type DayRecord, type StreakState } from '@lb/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

/** Demo/offline mirror of the server's quest + streak state (server is authoritative when signed in). */
interface QuestLocalState {
  streak: StreakState;
  days: Record<string, DayRecord>;
  today: { date: string; trainingDay: boolean; daily: QuestDto; penalty: QuestDto | null; sides: QuestDto[] } | null;
  bossClaims: string[];
  /** first game day the quest system ran (streak resolution starts here) */
  firstDay: string | null;
  set: (patch: Partial<Omit<QuestLocalState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

export const useQuestLocal = create<QuestLocalState>()(
  persist(
    (set) => ({
      streak: newStreakState(),
      days: {},
      today: null,
      bossClaims: [],
      firstDay: null,
      set: (patch) => set(patch),
      reset: () => set({ streak: newStreakState(), days: {}, today: null, bossClaims: [], firstDay: null }),
    }),
    { name: 'lb-quests', storage: createJSONStorage(() => zustandStorage) },
  ),
);
