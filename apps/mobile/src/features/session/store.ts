import { create } from 'zustand';

/**
 * booting   → restoring the saved session
 * signedOut → no session (after a sign-out, or a guest couldn't be started offline): the sign-in screen
 * signedIn  → a Supabase session (guest or saved account); the API is the source of truth
 * demo      → no backend configured: everything runs on-device
 */
export type SessionStatus = 'booting' | 'signedOut' | 'signedIn' | 'demo';

interface SessionState {
  status: SessionStatus;
  userId: string | null;
  email: string | null;
  /** anonymous guest account: everything works; saving with an email keeps it across phones */
  isGuest: boolean;
  set: (s: Partial<Omit<SessionState, 'set'>>) => void;
}

/** Not persisted — Supabase owns the persisted session; this mirrors it for the UI. */
export const useSession = create<SessionState>((set) => ({
  status: 'booting',
  userId: null,
  email: null,
  isGuest: false,
  set: (s) => set(s),
}));
