import { create } from 'zustand';

export type SessionStatus = 'booting' | 'signedIn' | 'demo' | 'error';

interface SessionState {
  status: SessionStatus;
  userId: string | null;
  error: string | null;
  set: (s: Partial<Omit<SessionState, 'set'>>) => void;
}

/** Not persisted — Supabase owns the persisted session; this mirrors it for the UI. */
export const useSession = create<SessionState>((set) => ({
  status: 'booting',
  userId: null,
  error: null,
  set: (s) => set(s),
}));
