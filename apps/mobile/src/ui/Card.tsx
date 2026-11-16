import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

/**
 * The default content surface: neutral, hairline border, generous radius.
 * `tint` adds a faint top wash of a colour (no coloured borders — keeps it calm).
 */
export function Card({
  children,
  tint,
  style,
  padded = true,
}: {
  children: ReactNode;
  tint?: string;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { c, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: c.border,
          overflow: 'hidden',
        },
        style,
      ]}>
      {tint ? (
        <LinearGradient
          pointerEvents="none"
          colors={[`${tint}1F`, `${tint}00`]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120 }}
        />
      ) : null}
      <View style={{ padding: padded ? spacing[4] : 0, gap: spacing[3] }}>{children}</View>
    </View>
  );
}
