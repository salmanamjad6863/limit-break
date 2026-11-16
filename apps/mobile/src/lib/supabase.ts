import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { env, isBackendConfigured } from './env';
import { asyncStorage } from './storage';

export const supabase = isBackendConfigured
  ? createClient(env.supabaseUrl, env.supabaseKey, {
      auth: {
        storage: asyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Refresh tokens only while the app is in the foreground (Supabase React Native guidance).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
