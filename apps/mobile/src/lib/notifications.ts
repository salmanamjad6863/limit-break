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

const QUEST_ID = 'daily-quest';

/** Daily Quest drop at the user's chosen time, in the System voice. Replaces any previous one. */
export async function scheduleDailyQuestReminder(hhmm: string, hunterName: string): Promise<void> {
  if (!supported) return;
  const [hour, minute] = hhmm.split(':').map(Number) as [number, number];
  await Notifications.cancelScheduledNotificationAsync(QUEST_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: QUEST_ID,
    content: { title: 'LIMITBREAK', body: renderTemplate(copy.dailyQuest ?? '', { name: hunterName }) },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}

export async function cancelDailyQuestReminder(): Promise<void> {
  if (!supported) return;
  await Notifications.cancelScheduledNotificationAsync(QUEST_ID).catch(() => {});
}

/**
 * Workout reminders 30 min before the user's training time on each picked weekday (SYSTEMS.md §3.10).
 * Rest days get none. Re-run whenever the schedule changes; `time = null` clears them.
 */
export async function scheduleWorkoutReminders(slots: readonly { weekday: number; hour: number; minute: number }[], workoutName: string): Promise<void> {
  if (!supported) return;
  await Promise.all([0, 1, 2, 3, 4, 5, 6].map((d) => Notifications.cancelScheduledNotificationAsync(`workout-${d}`).catch(() => {})));
  if (!slots.length || !(await Notifications.getPermissionsAsync()).granted) return;
  for (const s of slots) {
    await Notifications.scheduleNotificationAsync({
      identifier: `workout-${s.weekday}`,
      content: { title: 'Training in 30 minutes', body: `${workoutName} is waiting. Warm-up is guided. Just press start.` },
      // expo weekdays are 1 = Sunday … 7 = Saturday
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: s.weekday + 1, hour: s.hour, minute: s.minute },
    });
  }
}
