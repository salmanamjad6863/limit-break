import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './store';

/**
 * Guest-first (PLAN.md §7): restore the session, or sign in anonymously.
 * Requires "Anonymous sign-ins" enabled in Supabase → Authentication → Providers.
 * Apple/Google linking is offered after the first workout.
 */
export function useAuthBootstrap() {
  const set = useSession((s) => s.set);

  useEffect(() => {
    if (!supabase) {
      set({ status: 'demo', userId: null });
      return;
    }
    const client = supabase;
    let cancelled = false;
    (async () => {
      const { data } = await client.auth.getSession();
      let session = data.session;
      if (!session) {
        const res = await client.auth.signInAnonymously();
        if (res.error) {
          if (!cancelled) set({ status: 'error', error: res.error.message });
          return;
        }
        session = res.data.session;
      }
      if (!cancelled) set({ status: 'signedIn', userId: session?.user.id ?? null });
    })();

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      set(session ? { status: 'signedIn', userId: session.user.id } : { status: 'booting', userId: null });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [set]);
}
