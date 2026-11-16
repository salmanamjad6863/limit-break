import { colors } from '@lb/tokens';
import { Stack } from 'expo-router';

/** Workout flow: preview → session → debrief, plus quick interval sessions. No swipe-back mid-workout. */
export default function WorkoutLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false, contentStyle: { backgroundColor: colors.dark.background }, animation: 'fade' }} />;
}
