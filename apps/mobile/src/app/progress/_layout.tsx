import { colors } from '@lb/tokens';
import { Stack } from 'expo-router';

/** Private body progress: measurements, photos, Awakening frame, weekly debrief. */
export default function ProgressLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.dark.background }, animation: 'slide_from_right' }} />;
}
