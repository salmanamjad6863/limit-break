import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { TypewriterText } from '../motion/TypewriterText';
import { Text } from '../Text';

/**
 * Reserved for messages FROM the System (Daily Quest, awakening, warnings) — the one place
 * the anime HUD voice shows in everyday UI. A thin accent edge + "SYSTEM" tag; no neon frames.
 */
export function SystemWindow({
  title,
  accent,
  right,
  children,
  style,
  typeDelayMs = 0,
}: {
  title?: string;
  accent?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  typeDelayMs?: number;
  /** @deprecated kept for call-site compatibility; glow is always subtle now */
  glow?: boolean;
}) {
  const { c, radius, spacing } = useTheme();
  const tint = accent ?? c.accent;
  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: `${tint}40`,
          overflow: 'hidden',
          boxShadow: `0 0 32px ${tint}1F`,
        },
        style,
      ]}>
      <LinearGradient pointerEvents="none" colors={[`${tint}24`, `${tint}00`]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 110 }} />
      <View style={{ position: 'absolute', left: 0, top: 16, bottom: 16, width: 3, borderRadius: 2, backgroundColor: tint }} />
      <View style={{ padding: spacing[4], paddingLeft: spacing[5], gap: spacing[3] }}>
        {title ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text variant="micro" color={tint} style={{ fontFamily: 'Inter_700Bold', letterSpacing: 1.2 }}>SYSTEM</Text>
              <TypewriterText variant="label" color={c.text} text={title} delayMs={typeDelayMs} />
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}
