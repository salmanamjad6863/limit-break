import type { MeResponse, TrainingSettingsInput } from '@lb/contracts';
import { reminderSlots } from '@lb/engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { progressionKeys, useLocalHunter } from '@/features/progression';
import { useSession } from '@/features/session';
import { api, unwrap } from '@/lib/api';
import { scheduleWorkoutReminders } from '@/lib/notifications';
import { track } from '@/lib/analytics';

/** Saves training settings (server when signed in, on-device in demo) and reschedules workout reminders. */
export function useUpdateTraining() {
  const status = useSession((s) => s.status);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, nextWorkout }: { input: TrainingSettingsInput; nextWorkout: string }) => {
      const weekdays = [...new Set(input.weekdays)].sort((a, b) => a - b);
      if (status === 'signedIn') {
        const me = await unwrap<MeResponse>(await api.me.training.$put({ json: { ...input, weekdays } }));
        qc.setQueryData(progressionKeys.me(), me);
      } else {
        const me = useLocalHunter.getState().me;
        if (me?.profile) {
          useLocalHunter.getState().setMe({
            ...me,
            profile: { ...me.profile, ...input, weekdays, daysPerWeek: weekdays.length, workoutTime: input.workoutTime },
          });
        }
      }
      track({ event: 'settings_changed', area: 'training' });
      await scheduleWorkoutReminders(input.workoutTime ? reminderSlots(weekdays, input.workoutTime) : [], nextWorkout).catch(() => {});
    },
  });
}
