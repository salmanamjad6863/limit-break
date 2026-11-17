import { View } from 'react-native';
import { useTheme } from '@/theme';
import { PressableScale } from '../motion/PressableScale';
import { Text } from '../Text';

export function Chips<T extends string>({
  options,
  value,
  onToggle,
  accent,
}: {
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onToggle: (v: T) => void;
  accent?: string;
}) {
  const { c, radius, spacing } = useTheme();
  const tint = accent ?? c.accent;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <PressableScale
            key={o.value}
            haptic="tap"
            onPress={() => onToggle(o.value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            style={{
              paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.pill,
              borderWidth: 1, borderColor: on ? tint : c.border, backgroundColor: on ? `${tint}2A` : c.surface,
              
            }}>
            <Text variant="callout" color={on ? c.text : c.textDim}>{o.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
