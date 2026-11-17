import { notifications as copy, renderTemplate } from '@lb/content';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const supported = Platform.OS !== 'web';

/** Today at hh:mm local, or null if that time already passed. */
function todayAt(h: number, m = 0): Date | null {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime() > Date.now() + 60_000 ? d : null;
}

/**
 * Keeps today's one-off quest reminders in sync with quest state (PLAN.md §10):
 * streak-at-risk at 21:00 if the Daily Quest isn't done; a Penalty Zone nudge at 12:00 while active.
 * The daily drop itself is a repeating notification scheduled at onboarding.
 */
export async function syncQuestNotifications(s: { dailyDone: boolean; penaltyActive: boolean; streak: number; name: string }) {
  if (!supported) return;
  const perm = await Notifications.getPermissionsAsync().catch(() => null);
  if (!perm?.granted) return;
  await Notifications.cancelScheduledNotificationAsync('streak-risk').catch(() => {});
  await Notifications.cancelScheduledNotificationAsync('penalty-zone').catch(() => {});
  const risk = todayAt(21);
  if (!s.dailyDone && s.streak > 0 && risk) {
    await Notifications.scheduleNotificationAsync({
      identifier: 'streak-risk',
      content: { title: 'LIMITBREAK', body: renderTemplate(copy.streakRisk ?? '', { streak: s.streak }) },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: risk },
    });
  }
  const noon = todayAt(12);
  if (s.penaltyActive && noon) {
    await Notifications.scheduleNotificationAsync({
      identifier: 'penalty-zone',
      content: { title: 'LIMITBREAK', body: copy.penaltyZone ?? '' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: noon },
    });
  }
}
