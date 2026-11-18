/**
 * Gym Mode: oversized controls + keep screen awake during a live workout (SYSTEMS.md §6.3).
 * Preference is local to the device.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

interface GymModeState {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  toggle: () => void;
}

export const useGymMode = create<GymModeState>()(
  persist(
    (set, get) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
      toggle: () => set({ enabled: !get().enabled }),
    }),
    { name: 'lb-gym-mode', storage: createJSONStorage(() => zustandStorage) },
  ),
);
