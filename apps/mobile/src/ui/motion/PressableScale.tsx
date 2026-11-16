import { motion } from '@lb/tokens';
import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptics } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Every tappable surface: springs down on press, light haptic on release. */
export function PressableScale({
  children,
  style,
  scaleTo = 0.96,
  haptic = 'press',
  onPress,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: 'press' | 'tap' | 'none';
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, motion.spring.snappy));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, motion.spring.snappy));
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic !== 'none') haptics[haptic]();
        onPress?.(e);
      }}
      style={[style, animated]}>
      {children}
    </AnimatedPressable>
  );
}
