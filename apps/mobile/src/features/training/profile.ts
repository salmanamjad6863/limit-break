import type { TrainingProfile } from '@lb/contracts';
import { useMe } from '@/features/progression/api';

/** Sensible defaults when a profile is missing (older demo data). */
export const DEFAULT_PROFILE: TrainingProfile = {
  goal: 'maintain', experience: 'beginner', location: 'HOME', equipment: [], injuries: [], daysPerWeek: 3,
  sessionMinutes: 45, sex: 'unspecified', heightCm: 175, weightKg: 75, timezone: 'UTC',
};

export function useTrainingProfile(): TrainingProfile {
  const { data } = useMe();
  return data?.profile ?? DEFAULT_PROFILE;
}
