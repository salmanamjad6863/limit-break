import type { TextProps } from 'react-native';
import { Text } from '../Text';
import { useCountUp } from './useCountUp';

export function CountUp({
  value,
  duration,
  delay,
  format = (n) => Math.round(n).toLocaleString(),
  ...rest
}: Omit<React.ComponentProps<typeof Text>, 'children'> &
  TextProps & { value: number; duration?: number; delay?: number; format?: (n: number) => string }) {
  const v = useCountUp(value, duration, delay);
  return <Text {...rest}>{format(v)}</Text>;
}
