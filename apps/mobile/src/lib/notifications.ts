import { notifications as copy, renderTemplate } from '@lb/content';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const supported = Platform.OS !== 'web';

Notifications.setNotificationHandler?.({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Asks the OS for permission. Call only after the in-app primer (PLAN.md §7 step 13). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!supported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

/** Daily Quest drop at the user's chosen time, in the System voice. Replaces any previous one. */
export async function scheduleDailyQuestReminder(hhmm: string, hunterName: string): Promise<void> {
  if (!supported) return;
  const [hour, minute] = hhmm.split(':').map(Number) as [number, number];
  const ID = 'daily-quest';
  await Notifications.cancelScheduledNotificationAsync(ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: ID,
    content: { title: 'LIMITBREAK', body: renderTemplate(copy.dailyQuest ?? '', { name: hunterName }) },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}
