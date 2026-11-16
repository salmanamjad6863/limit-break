import { View } from 'react-native';
import { useTheme } from '@/theme';
import { CountUp } from '../motion/CountUp';
import { Text } from '../Text';
import { Bar } from './Bar';

export function StatRow({
  label,
  value,
  max = 1000,
  color,
  delayMs = 0,
}: {
  label: string;
  value: number;
  max?: number;
  color?: string;
  delayMs?: number;
}) {
  const { c, spacing } = useTheme();
  return (
    <View style={{ gap: spacing[1] + 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="label" dim>{label}</Text>
        <CountUp variant="heading" color={c.text} value={value} delay={delayMs} style={{ fontFamily: 'Rajdhani_700Bold', fontSize: 18 }} />
      </View>
      <Bar ratio={value / max} height={5} color={color} delayMs={delayMs} />
    </View>
  );
}
