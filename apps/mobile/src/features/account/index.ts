/**
 * Data export and permanent account deletion (App Store 5.1.1(v), Google Play, GDPR).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Platform, Share } from 'react-native';
import { useLocalHunter } from '@/features/progression/localHunter';
import { useProgress } from '@/features/progression/progressStore';
import { useNutritionLocal } from '@/features/nutrition/local';
import { useQuestLocal } from '@/features/quests/localStore';
import { signOut, useSession } from '@/features/session';
import { SIGNED_OUT_FLAG } from '@/features/session/auth';
import { useTraining } from '@/features/training/store';
import { api, unwrap } from '@/lib/api';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { clearLocalData } from './localData';

export { clearLocalData };

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
        // The account is gone: land on the sign-in screen (with "start as a new hunter"), never an automatic guest.
        storage.set(SIGNED_OUT_FLAG, true);
        // 'local' removes the session from this device first, whatever the server answers (the user no longer exists).
        await supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
      }
      clearLocalData();
      qc.clear();
      // No router.replace here: '/' is guarded off when signed out; SIGNED_OUT_FLAG + the session
      // listener send the user to the sign-in screen (with "start as a new hunter").
    },
  });

  /** Unsynced offline changes (paused mutations) would be lost by signing out; the UI warns first. */
  const unsynced = () => qc.getMutationCache().getAll().some((m) => m.state.isPaused || m.state.status === 'pending');

  // Local data and cache are wiped by the session listener on SIGNED_OUT (useAuthBootstrap).
  const signOutHere = useMutation({ mutationFn: () => signOut('local') });
  const signOutEverywhere = useMutation({ mutationFn: () => signOut('global') });

  return { exportData, deleteAccount, signOutHere, signOutEverywhere, unsynced };
}
