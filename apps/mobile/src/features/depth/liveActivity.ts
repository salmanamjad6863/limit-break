/**
 * Rest-timer Live Activity / ongoing notification hook (SYSTEMS.md §6.4).
 * Full `expo-widgets` Live Activities need a rebuilt dev client. Until then this is a safe no-op
 * that keeps the call sites ready.
 */
import { Platform } from 'react-native';

export type RestActivityState = {
  exerciseName: string;
  secondsLeft: number;
  upNext: string;
};

let activeId: string | null = null;

export async function startRestActivity(_state: RestActivityState): Promise<void> {
  if (Platform.OS === 'web') return;
  // Native Live Activity via expo-widgets lands after `npx expo install expo-widgets` + rebuild.
  activeId = 'pending';
}

export async function updateRestActivity(_state: RestActivityState): Promise<void> {
  if (!activeId) return;
}

export async function endRestActivity(): Promise<void> {
  activeId = null;
}

export const liveActivitySupported = false;
