import type { IdentityInput, MeResponse, NotificationSettingsInput } from '@lb/contracts';
import { reminderSlots } from '@lb/engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { progressionKeys, useLocalHunter } from '@/features/progression';
import { useSession } from '@/features/session';
import { track } from '@/lib/analytics';
import { api, unwrap } from '@/lib/api';
import { cancelDailyQuestReminder, scheduleDailyQuestReminder, scheduleWorkoutReminders } from '@/lib/notifications';
import { setWorkoutRemindersOn, workoutRemindersOn } from './reminders';

export { setWorkoutRemindersOn, workoutRemindersOn } from './reminders';

function applyMe(qc: ReturnType<typeof useQueryClient>, me: MeResponse) {
  qc.setQueryData(progressionKeys.me(), me);
  const local = useLocalHunter.getState().me;
  if (local) useLocalHunter.getState().setMe({ ...local, ...me, state: me.state ?? local.state, profile: me.profile ?? local.profile });
}

export function useUpdateIdentity() {
  const status = useSession((s) => s.status);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: IdentityInput) => {
      if (status === 'signedIn') {
        const me = await unwrap<MeResponse>(await api.me.identity.$put({ json: input }));
        applyMe(qc, me);
        return me;
      }
      const me = useLocalHunter.getState().me;
      if (!me) throw new Error('No hunter yet.');
      const next = { ...me, hunterName: input.hunterName, heroId: input.heroId };
      useLocalHunter.getState().setMe(next);
      return next;
    },
    onSuccess: async (me) => {
      track({ event: 'settings_changed', area: 'identity' });
      if (me.notificationsOptIn && me.questTime && me.hunterName) {
        await scheduleDailyQuestReminder(me.questTime, me.hunterName).catch(() => {});
      }
    },
  });
}

export function useUpdateNotifications() {
  const status = useSession((s) => s.status);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NotificationSettingsInput & { workoutReminders: boolean; weekdays: number[]; workoutTime: string | null; workoutName: string }) => {
      setWorkoutRemindersOn(input.workoutReminders);
      if (status === 'signedIn') {
        const me = await unwrap<MeResponse>(await api.me.notifications.$put({ json: { notificationsOptIn: input.notificationsOptIn, questTime: input.questTime } }));
        applyMe(qc, me);
      } else {
        const me = useLocalHunter.getState().me;
        if (me) useLocalHunter.getState().setMe({ ...me, notificationsOptIn: input.notificationsOptIn, questTime: input.questTime });
      }
      const name = (status === 'signedIn' ? (qc.getQueryData<MeResponse>(progressionKeys.me())?.hunterName) : useLocalHunter.getState().me?.hunterName) ?? 'Hunter';
      if (input.notificationsOptIn) await scheduleDailyQuestReminder(input.questTime, name).catch(() => {});
      else await cancelDailyQuestReminder().catch(() => {});
      const slots = input.workoutReminders && input.workoutTime ? reminderSlots(input.weekdays, input.workoutTime) : [];
      await scheduleWorkoutReminders(slots, input.workoutName).catch(() => {});
      track({ event: 'settings_changed', area: 'notifications' });
    },
  });
}
