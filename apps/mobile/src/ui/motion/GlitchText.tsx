import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '../Text';

/**
 * Brand moments only (cold open, cinematics). Chromatic-split glitch: cyan + crimson ghost copies jitter for a beat, then settle.
 * `repeatEveryMs` re-triggers a short glitch periodically (0 = only on mount).
 */
export function GlitchText({
  children,
  color,
  repeatEveryMs = 0,
  ...rest
}: Omit<React.ComponentProps<typeof Text>, 'children'> & { children: string; repeatEveryMs?: number }) {
  const reduce = useReducedMotion();
  const jitter = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    const burst = withSequence(
      withTiming(1, { duration: 40 }),
      withTiming(-1, { duration: 40 }),
      withTiming(0.6, { duration: 40 }),
      withTiming(-0.4, { duration: 50 }),
      withTiming(0, { duration: 60 }),
    );
    jitter.set(
      repeatEveryMs > 0 ? withRepeat(withSequence(burst, withDelay(repeatEveryMs, withTiming(0, { duration: 1 }))), -1) : burst,
    );
  }, [reduce, repeatEveryMs, jitter]);

  const cyan = useAnimatedStyle(() => ({
    opacity: Math.abs(jitter.get()) * 0.9,
    transform: [{ translateX: jitter.get() * 3 }, { translateY: jitter.get() * -1 }],
  }));
  const red = useAnimatedStyle(() => ({
    opacity: Math.abs(jitter.get()) * 0.9,
    transform: [{ translateX: jitter.get() * -3 }, { translateY: jitter.get() }],
  }));

  return (
    <View>
      <Animated.View
        style={[{ position: 'absolute', left: 0, top: 0 }, cyan]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden>
        <Text {...rest} color="#38C6F4">{children}</Text>
      </Animated.View>
      <Animated.View
        style={[{ position: 'absolute', left: 0, top: 0 }, red]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden>
        <Text {...rest} color="#FF4D6D">{children}</Text>
      </Animated.View>
      <Text {...rest} color={color}>{children}</Text>
    </View>
  );
}
