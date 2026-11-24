import { colors } from '@lb/tokens';
import { Stack } from 'expo-router';

export default function RoutineLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.dark.background }, animation: 'slide_from_right' }}>
      <Stack.Screen name="[id]" />
      <Stack.Screen name="pick" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
