import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { Text } from '../Text';

/** System-message reveal: characters type in, with a blinking block cursor while typing. */
export function TypewriterText({
  text,
  speedMs = 28,
  delayMs = 0,
  ...rest
}: Omit<React.ComponentProps<typeof Text>, 'children'> & { text: string; speedMs?: number; delayMs?: number }) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(reduce ? text.length : 0);

  useEffect(() => {
    if (reduce) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      interval = setInterval(() => {
        setCount((c) => {
          if (c >= text.length) {
            clearInterval(interval);
            return c;
          }
          return c + 1;
        });
      }, speedMs);
    }, delayMs);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
    };
  }, [text, speedMs, delayMs, reduce]);

  const typing = count < text.length;
  return (
    <Text {...rest}>
      {text.slice(0, count)}
      {typing ? '▌' : ''}
    </Text>
  );
}
