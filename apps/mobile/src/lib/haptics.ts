import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS !== 'web';

/** Every big moment = motion + haptic + sound (ARCHITECTURE.md §5.1). */
export const haptics = {
  tap: () => enabled && Haptics.selectionAsync().catch(() => {}),
  press: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  heavy: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  success: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  /** Level-up: a short rising triple pulse. */
  levelUp: () => {
    if (!enabled) return;
    [0, 90, 200].forEach((ms, i) =>
      setTimeout(
        () => Haptics.impactAsync(i < 2 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
        ms,
      ),
    );
  },
};
