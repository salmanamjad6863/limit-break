/**
 * Data export and permanent account deletion (App Store 5.1.1(v), Google Play, GDPR).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Platform, Share } from 'react-native';
import { useOnboarding } from '@/features/onboarding/store';
import { useLocalHunter, useProgress } from '@/features/progression';
import { useNutritionLocal } from '@/features/nutrition/local';
import { useQuestLocal } from '@/features/quests/localStore';
import { useSession } from '@/features/session';
import { useTraining, useWorkoutSession } from '@/features/training';
import { api, unwrap } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useVoicePref } from '@/lib/voice';
import { useAnalyticsConsent } from '@/lib/analytics';

/** Every persisted store that can hold personal data. */
const STORES = [useLocalHunter, useTraining, useWorkoutSession, useProgress, useNutritionLocal, useQuestLocal, useOnboarding, useVoicePref, useAnalyticsConsent] as const;

type Persisted = { persist?: { clearStorage: () => void }; getInitialState: () => unknown; setState: (s: never, replace: true) => void };

/** Wipes on-device data: persisted storage and in-memory state. */
export function clearLocalData() {
  for (const store of STORES as unknown as Persisted[]) {
    store.persist?.clearStorage();
    store.setState(store.getInitialState() as never, true);
  }
}

function localExport() {
  const pick = (s: object) => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function'));
  return {
    exportedAt: new Date().toISOString(), format: 'limitbreak-export/1', source: 'device',
    hunter: useLocalHunter.getState().me, training: pick(useTraining.getState()), nutrition: pick(useNutritionLocal.getState()),
    quests: pick(useQuestLocal.getState()), progress: pick(useProgress.getState()),
  };
}

/** Web downloads a file; phones open the share sheet (Files, email, Drive…). */
async function shareJson(json: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'limitbreak-export.json';
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: 'LIMITBREAK data export', message: json });
}

export function useAccountActions() {
  const status = useSession((s) => s.status);
  const qc = useQueryClient();

  const exportData = useMutation({
    mutationFn: async () => {
      const data = status === 'signedIn' ? await unwrap<object>(await api.me.export.$get()) : localExport();
      await shareJson(JSON.stringify(data, null, 2));
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      if (status === 'signedIn') {
        await unwrap(await api.me.$delete({ json: { confirm: 'DELETE' } }));
        await supabase?.auth.signOut().catch(() => {});
      }
      clearLocalData();
      qc.clear();
    },
    onSuccess: () => router.replace('/'),
  });

  return { exportData, deleteAccount };
}
