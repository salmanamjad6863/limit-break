import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme';

/** Calm progress bar: flat fill that eases in. Pass `color` for data bars. */
export function Bar({
  ratio,
  color,
  height = 6,
  delayMs = 0,
}: {
  ratio: number;
  color?: string;
  height?: number;
  delayMs?: number;
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const target = Math.min(1, Math.max(0, ratio));
  const p = useSharedValue(reduce ? target : 0);

  useEffect(() => {
    p.set(reduce ? target : withDelay(delayMs, withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) })));
  }, [target, delayMs, reduce, p]);

  const fill = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.track, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', borderRadius: height, backgroundColor: color ?? c.accent }, fill]} />
    </View>
  );
}
