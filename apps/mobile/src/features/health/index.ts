/**
 * HealthKit / Health Connect adapter (SYSTEMS.md §6 / PLAN).
 * Stubbed until native modules ship in a dedicated EAS build with the right permissions.
 * Callers should treat `available` as false in Expo Go.
 */
import { Platform } from 'react-native';

export type HealthWeightSample = { kg: number; at: string; source: 'apple' | 'google' | 'manual' };

export interface HealthBridge {
  available: boolean;
  requestPermissions(): Promise<boolean>;
  readLatestWeight(): Promise<HealthWeightSample | null>;
  writeWorkout(i: { startedAt: string; finishedAt: string; name: string; energyKcal?: number }): Promise<void>;
}

const stub: HealthBridge = {
  available: false,
  async requestPermissions() {
    return false;
  },
  async readLatestWeight() {
    return null;
  },
  async writeWorkout() {
    /* no-op until native bridge lands */
  },
};

/** Platform-aware entry. Replace bodies when `react-native-health` / Health Connect are linked. */
export const health: HealthBridge = {
  ...stub,
  available: Platform.OS === 'ios' || Platform.OS === 'android' ? false : false,
};

export function healthStatusLabel() {
  if (Platform.OS === 'web') return 'Health sync is for phones.';
  return 'HealthKit / Health Connect arrives in a later native build. Weight still logs in the diary.';
}
