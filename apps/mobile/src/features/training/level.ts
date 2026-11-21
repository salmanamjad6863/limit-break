import type { TrainingSettingsInput } from '@lb/contracts';
import type { Experience } from '@lb/engine';
import { useTrainingProfile } from './profile';
import { useUpdateTraining } from './settings';
import { useToday } from './today';

const MINUTES = [15, 30, 45, 60, 75, 90] as const;
const nearestMinutes = (m: number) => MINUTES.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));

/** The full settings input from the current profile, with a patch: one-tap changes (level, sex) reuse it. */
export function useTrainingPatch() {
  const profile = useTrainingProfile();
  const today = useToday();
  const save = useUpdateTraining();
  const apply = (patch: Partial<TrainingSettingsInput>, opts?: { onSuccess?: () => void }) =>
    save.mutate({
      input: {
        experience: profile.experience, location: profile.location, equipment: profile.equipment, injuries: profile.injuries,
        sessionMinutes: nearestMinutes(profile.sessionMinutes), weekdays: today.weekdays, workoutTime: profile.workoutTime ?? null,
        ...patch,
      },
      nextWorkout: today.workout.name,
    }, opts);
  return { apply, isPending: save.isPending };
}

/** Change level in one tap (promotion or demotion, docs/plans/TRAIN_REDESIGN.md §4.1). */
export function useChangeLevel() {
  const { apply, isPending } = useTrainingPatch();
  return { changeLevel: (experience: Experience, opts?: { onSuccess?: () => void }) => apply({ experience }, opts), isPending };
}
