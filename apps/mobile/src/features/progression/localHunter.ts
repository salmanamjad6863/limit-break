import type { MeResponse } from '@lb/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

/**
 * Demo/offline mode stores the hunter on-device (no Supabase configured).
 * With a backend, the server is the source of truth and this stays empty.
 */
interface LocalHunterState {
  me: MeResponse | null;
  setMe: (me: MeResponse) => void;
  reset: () => void;
}

export const useLocalHunter = create<LocalHunterState>()(
  persist(
    (set) => ({
      me: null,
      setMe: (me) => set({ me }),
      reset: () => set({ me: null }),
    }),
    { name: 'lb-local-hunter', storage: createJSONStorage(() => zustandStorage) },
  ),
);

export const UNAWAKENED: MeResponse = {
  id: 'local',
  onboarded: false,
  hunterName: null,
  heroId: null,
  heroClass: null,
  state: null,
};
