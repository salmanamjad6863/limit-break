import { storage } from '@/lib/storage';

const KEY = 'lb-workout-reminders';

/** Device-local: workout push reminders. Default on when the user has a training time. */
export function workoutRemindersOn(): boolean {
  return storage.getBoolean(KEY) !== false;
}

export function setWorkoutRemindersOn(on: boolean): void {
  storage.set(KEY, on);
}
