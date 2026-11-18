import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { clearLocalData } from '@/features/account/localData';
import { setQueryCacheOwner } from '@/lib/query';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { LAST_WAS_SAVED_FLAG, SIGNED_OUT_FLAG, startGuest } from './auth';
import { useSession } from './store';

const LAST_USER = 'lb.session.lastUser';

/**
 * Guest-first session (PLAN.md §7), mirrored into the UI:
 * - no session on a fresh install → a guest account starts automatically (train right away)
 * - no session after a deliberate sign-out, or after a saved account's session ended (revoked elsewhere,
 *   account deleted) → the sign-in screen (with "continue as a new guest"), never a silent new guest
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
        setQueryCacheOwner(null);
        if (storage.getString(LAST_USER)) {
          clearLocalData();
          storage.remove(LAST_USER);
        }
        if (storage.getBoolean(LAST_WAS_SAVED_FLAG)) {
          // A saved account's session ended without a deliberate sign-out: same as signing out.
          storage.set(SIGNED_OUT_FLAG, true);
          storage.remove(LAST_WAS_SAVED_FLAG);
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
      // The owner changes first, so nothing of the previous account's cache can be saved for (or restored to) this one.
      setQueryCacheOwner(session.user.id);
      if (prev && prev !== session.user.id) clearLocalData();
      storage.set(LAST_USER, session.user.id);
      if (session.user.is_anonymous === true) storage.remove(LAST_WAS_SAVED_FLAG);
      else storage.set(LAST_WAS_SAVED_FLAG, true);
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
