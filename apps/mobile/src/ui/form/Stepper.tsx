import { useRef } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { PressableScale } from '../motion/PressableScale';
import { Icon } from '../Icon';
import { Text } from '../Text';

/** Big-number stepper; hold a button to repeat. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  unit?: string;
}) {
  const { c, radius, spacing } = useTheme();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef(value);
  latest.current = value;

  const clampRound = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const bump = (dir: 1 | -1) => onChange(clampRound(latest.current + dir * step));
  const startRepeat = (dir: 1 | -1) => {
    timer.current = setInterval(() => {
      latest.current = clampRound(latest.current + dir * step);
      onChange(latest.current);
    }, 90);
  };
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const Btn = ({ dir }: { dir: 1 | -1 }) => (
    <PressableScale
      haptic="tap"
      onPress={() => bump(dir)}
      onLongPress={() => startRepeat(dir)}
      onPressOut={stop}
      accessibilityRole="button"
      accessibilityLabel={`${dir > 0 ? 'Increase' : 'Decrease'} ${label}`}
      style={{
        width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
        backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border,
      }}>
      <Icon name={dir > 0 ? 'add' : 'remove'} size={22} color={c.accentGlow} />
    </PressableScale>
  );

  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing[3], gap: spacing[2] }}>
      <Text variant="label" dim>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Btn dir={-1} />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[1] }}>
          <Text variant="stat" style={{ fontSize: 36, lineHeight: 40 }}>{format(value)}</Text>
          {unit ? <Text variant="label" dim>{unit}</Text> : null}
        </View>
        <Btn dir={1} />
      </View>
    </View>
  );
}
