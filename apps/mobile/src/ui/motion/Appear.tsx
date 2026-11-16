import { motion } from '@lb/tokens';
import { useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

/**
 * Staggered entrance (fade + rise) that replays every time the screen gains focus,
 * so switching tabs always feels alive. `index` sets the stagger slot.
 * Focus-driven rather than mount-driven: tabs mounted while hidden still animate in.
 */
export function Appear({
  children,
  index = 0,
  style,
}: {
  children: ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);

  useFocusEffect(
    useCallback(() => {
      if (reduce) {
        p.set(1);
        return;
      }
      p.set(0);
      p.set(withDelay(index * motion.stagger.hud, withSpring(1, motion.spring.smooth)));
    }, [index, reduce, p]),
  );

  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(p.get(), [0, 1], [18, 0]) }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
