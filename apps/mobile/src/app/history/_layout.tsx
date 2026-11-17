import { colors } from '@lb/tokens';
import { Stack } from 'expo-router';

export default function HistoryLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.dark.background }, animation: 'slide_from_right' }} />;
}
