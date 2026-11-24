/**
 * On-device personal data. Imports the stores directly (not the feature barrels) so the session layer can
 * use it without an import cycle.
 */
import { useAchievementLocal } from '@/features/achievements/local';
import { useLookLocal } from '@/features/avatar/look';
import { useProfilePhoto } from '@/features/avatar/photo';
import { useChallengeStore } from '@/features/challenges/store';
import { useOnboarding } from '@/features/onboarding/store';
import { useNutritionLocal } from '@/features/nutrition/local';
import { useLocalHunter } from '@/features/progression/localHunter';
import { useProgress } from '@/features/progression/progressStore';
import { useQuestLocal } from '@/features/quests/localStore';
import { useWorkoutSession } from '@/features/training/session';
import { useTraining } from '@/features/training/store';
import { useAnalyticsConsent } from '@/lib/analytics';
import { QUERY_CACHE_KEY, queryClient, queryPersister } from '@/lib/query';
import { storage } from '@/lib/storage';
import { useVoicePref } from '@/lib/voice';

/** Every persisted store that can hold personal data. */
const STORES = [useLocalHunter, useTraining, useChallengeStore, useAchievementLocal, useLookLocal, useProfilePhoto, useWorkoutSession, useProgress, useNutritionLocal, useQuestLocal, useOnboarding, useVoicePref, useAnalyticsConsent] as const;

type Persisted = { persist?: { clearStorage: () => void }; getInitialState: () => unknown; setState: (s: never, replace: true) => void };

/** Wipes on-device data: persisted stores, in-memory state and the cached server responses. */
export function clearLocalData() {
  for (const store of STORES as unknown as Persisted[]) {
    store.persist?.clearStorage();
    store.setState(store.getInitialState() as never, true);
  }
  // Queries and (paused) mutations, in memory and on disk. The key is removed synchronously so nothing of this
  // account can be restored even if the app is killed right now.
  queryClient.clear();
  storage.remove(QUERY_CACHE_KEY);
  void queryPersister.removeClient();
}
