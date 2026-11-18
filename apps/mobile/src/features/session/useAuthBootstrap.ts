import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { clearLocalData } from '@/features/account/localData';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { SIGNED_OUT_FLAG, startGuest } from './auth';
import { useSession } from './store';

const LAST_USER = 'lb.session.lastUser';

/**
 * Guest-first session (PLAN.md §7), mirrored into the UI:
 * - no session on a fresh install → a guest account starts automatically (train right away)
 * - no session after a deliberate sign-out → the sign-in screen (with "continue as a new guest")
 * - a different account signing in → the previous account's on-device data and cache are wiped first
 * - signing out (or a revoked/expired refresh token) → on-device data is wiped
 * - a guest saving their progress keeps the same user id, so nothing is wiped or migrated
 */
export function useAuthBootstrap() {
  const set = useSession((s) => s.set);

  useEffect(() => {
    if (!supabase) {
      set({ status: 'demo', userId: null, email: null, isGuest: false });
      return;
    }

    const adopt = (session: Session | null) => {
      if (!session) {
        if (storage.getString(LAST_USER)) {
          clearLocalData();
          storage.remove(LAST_USER);
        }
        if (storage.getBoolean(SIGNED_OUT_FLAG)) {
          set({ status: 'signedOut', userId: null, email: null, isGuest: false });
          return;
        }
        set({ status: 'booting', userId: null, email: null, isGuest: false });
        // Outside the auth callback (never await Supabase calls inside it). Offline → sign-in screen with retry.
        setTimeout(() => {
          startGuest().catch(() => set({ status: 'signedOut' }));
        }, 0);
        return;
      }
      storage.remove(SIGNED_OUT_FLAG);
      const prev = storage.getString(LAST_USER);
      if (prev && prev !== session.user.id) clearLocalData();
      storage.set(LAST_USER, session.user.id);
      set({
        status: 'signedIn',
        userId: session.user.id,
        email: session.user.email || null,
        isGuest: session.user.is_anonymous === true,
      });
    };

    // INITIAL_SESSION fires first with the restored session (or null).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const cur = useSession.getState();
      const same = session && cur.userId === session.user.id && cur.isGuest === (session.user.is_anonymous === true);
      if (event === 'TOKEN_REFRESHED' && same) return;
      adopt(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [set]);
}
