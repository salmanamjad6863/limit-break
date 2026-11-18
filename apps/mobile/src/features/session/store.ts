import { create } from 'zustand';

/**
 * booting   → restoring the saved session
 * signedOut → no session: the email sign-in screen
 * signedIn  → a verified (non-anonymous) Supabase user; the API is the source of truth
 * demo      → no backend configured: everything runs on-device
 */
export type SessionStatus = 'booting' | 'signedOut' | 'signedIn' | 'demo';

interface SessionState {
  status: SessionStatus;
  userId: string | null;
  email: string | null;
  set: (s: Partial<Omit<SessionState, 'set'>>) => void;
}

/** Not persisted — Supabase owns the persisted session; this mirrors it for the UI. */
export const useSession = create<SessionState>((set) => ({
  status: 'booting',
  userId: null,
  email: null,
  set: (s) => set(s),
}));
