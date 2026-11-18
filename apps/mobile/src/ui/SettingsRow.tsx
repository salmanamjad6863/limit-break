import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './motion/PressableScale';
import { Text } from './Text';

/** Grouped list row (Settings hub). */
export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  last = false,
  destructive = false,
}: {
  icon?: IconName;
  label: string;
  value?: string | null;
  onPress?: () => void;
  last?: boolean;
  destructive?: boolean;
}) {
  const { c, spacing } = useTheme();
  const color = destructive ? c.danger : c.text;
  return (
    <PressableScale
      haptic="tap"
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={value ? `${label}, ${value}` : label}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3] + 2,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: c.border,
        }}
      >
        {icon ? <Icon name={icon} size={20} color={destructive ? c.danger : c.accentGlow} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="callout" color={color}>{label}</Text>
          {value ? <Text variant="caption" muted numberOfLines={1}>{value}</Text> : null}
        </View>
        {onPress ? <Icon name="chevron-forward" size={16} color={c.textMuted} /> : null}
      </View>
    </PressableScale>
  );
}

/** Gear that opens Settings — Home header and Profile. */
export function SettingsGear({ size = 36 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <PressableScale
      haptic="tap"
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.surfaceRaised,
      }}
    >
      <Icon name="settings-outline" size={Math.round(size * 0.52)} color={c.text} />
    </PressableScale>
  );
}

export function SettingsGroup({ children }: { children: ReactNode }) {
  return <View>{children}</View>;
}
