import { View } from 'react-native';
import { useTheme } from '@/theme';
import { PressableScale } from '../motion/PressableScale';
import { Text } from '../Text';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  const { c, radius, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <PressableScale
            key={o.value}
            haptic="tap"
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={{
              flex: 1, alignItems: 'center', paddingVertical: spacing[2], borderRadius: radius.md - 3,
              backgroundColor: on ? c.accent : 'transparent', 
            }}>
            <Text variant="callout" color={on ? '#FFFFFF' : c.textDim}>{o.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
