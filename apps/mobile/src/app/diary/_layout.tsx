import { colors } from '@lb/tokens';
import { Stack } from 'expo-router';

/** Food diary flows: add → portion, scan, quick add, custom food, settings, weight. */
export default function DiaryLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.dark.background }, animation: 'slide_from_right' }} />;
}
