import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { clearLocalData } from '@/features/account/localData';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useSession } from './store';

const LAST_USER = 'lb.session.lastUser';

/**
 * Mirrors the Supabase session into the UI and protects personal data on shared devices:
 * - a different account signing in → the previous account's on-device data and cache are wiped first
 * - signing out (or a revoked/expired refresh token) → on-device data is wiped
 * - anonymous sessions (from the old guest-first build) are not accepted: signed out, email sign-in instead
 */
export function useAuthBootstrap() {
  const set = useSession((s) => s.set);

  useEffect(() => {
    if (!supabase) {
      set({ status: 'demo', userId: null, email: null });
      return;
    }
    const client = supabase;

    const adopt = (session: Session | null) => {
      if (!session || session.user.is_anonymous) {
        if (session) setTimeout(() => void client.auth.signOut({ scope: 'local' }), 0);
        if (storage.getString(LAST_USER)) {
          clearLocalData();
          storage.remove(LAST_USER);
        }
        set({ status: 'signedOut', userId: null, email: null });
        return;
      }
      const prev = storage.getString(LAST_USER);
      if (prev && prev !== session.user.id) clearLocalData();
      storage.set(LAST_USER, session.user.id);
      set({ status: 'signedIn', userId: session.user.id, email: session.user.email ?? null });
    };

    // INITIAL_SESSION fires first with the restored session (or null). Never await Supabase calls in here.
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session && useSession.getState().userId === session.user.id) return;
      adopt(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [set]);
}
