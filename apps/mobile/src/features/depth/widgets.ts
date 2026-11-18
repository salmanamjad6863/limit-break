/**
 * Home-screen widget / glanceable rest-timer surface (SYSTEMS.md §6.4).
 * Requires a custom EAS build with widget targets. Stub keeps call sites stable.
 */
import { Platform } from 'react-native';

export type WidgetSnapshot = {
  streak: number;
  nextWorkout: string;
  restSecondsLeft?: number;
};

export const widgetsSupported = false;

export async function pushWidgetSnapshot(_snap: WidgetSnapshot): Promise<void> {
  if (Platform.OS === 'web') return;
  // expo-widgets / App Groups bridge lands with a dedicated native rebuild.
}

export function widgetsStatusLabel() {
  return 'Home widgets ship with a later native build. Your streak and next workout stay in the app.';
}
