import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon } from '../Icon';
import { PressableScale } from '../motion/PressableScale';
import { Text } from '../Text';

/** Selectable card: neutral surface; selected = accent border, faint tint and a check. */
export function OptionCard({
  title,
  subtitle,
  selected,
  onPress,
  accent,
  badge,
  leading,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  accent?: string;
  badge?: string;
  leading?: ReactNode;
}) {
  const { c, radius, spacing } = useTheme();
  const tint = accent ?? c.accent;
  return (
    <PressableScale
      haptic="tap"
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      scaleTo={0.98}
      style={{
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderColor: selected ? tint : c.border,
        backgroundColor: selected ? `${tint}14` : c.surface,
        padding: spacing[4],
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
      }}>
      {leading}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text variant="heading">{title}</Text>
          {badge ? (
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: `${tint}26` }}>
              <Text variant="micro" color={c.accentGlow} style={{ fontFamily: 'Inter_600SemiBold' }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text variant="caption" dim>{subtitle}</Text> : null}
      </View>
      <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? tint : c.textMuted} />
    </PressableScale>
  );
}
