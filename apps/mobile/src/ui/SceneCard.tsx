import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './motion';
import { Text } from './Text';

/**
 * An illustrated card: a painted backdrop (real art when it exists, otherwise a two-colour scene with a
 * large soft emblem and light glows) and a bold title over a readable dark fade. Used for habit cards,
 * achievement tiles and the rank carousel so they share one look.
 */
export function SceneCard({
  title, subtitle, icon, colors, art, height = 150, onPress, selected, locked, footer, style, accessibilityLabel, children,
}: {
  title?: string;
  subtitle?: string;
  icon: IconName;
  /** top-left, bottom-right */
  colors: readonly [string, string];
  /** optional illustration; replaces the generated scene */
  art?: ImageSource | number | null;
  height?: number;
  onPress?: () => void;
  selected?: boolean;
  /** a dark, quiet card (not earned / not available) */
  locked?: boolean;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  const { c, radius, spacing } = useTheme();
  const [a, b] = locked ? (['#1B1A23', '#0F0E15'] as const) : colors;
  const body = (
    <View style={[{ height, borderRadius: radius.lg, overflow: 'hidden', borderWidth: selected ? 2 : 1, borderColor: selected ? c.accentGlow : 'rgba(255,255,255,0.08)' }, style]}>
      {art && !locked ? (
        <Image source={art} contentFit="cover" style={{ position: 'absolute', inset: 0 }} />
      ) : (
        <>
          <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
          {/* soft light: a glow up top and a horizon line, so it reads as a scene rather than a flat swatch */}
          <View style={{ position: 'absolute', width: height, height, borderRadius: height, top: -height * 0.45, left: -height * 0.2, backgroundColor: 'rgba(255,255,255,0.10)' }} />
          <View style={{ position: 'absolute', width: height * 0.5, height: height * 0.5, borderRadius: height, top: height * 0.12, right: height * 0.08, backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <View style={{ position: 'absolute', right: -height * 0.1, top: -height * 0.02, transform: [{ rotate: '-12deg' }], opacity: locked ? 0.08 : 0.28 }}>
            <Icon name={icon} size={height * 0.78} color="#FFFFFF" />
          </View>
        </>
      )}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']} locations={[0.35, 0.7, 1]} style={{ position: 'absolute', inset: 0 }} />
      {children}
      <View style={{ position: 'absolute', left: spacing[3], right: spacing[3], bottom: spacing[3], gap: 2 }}>
        {title ? <Text variant="headline" color="#FFFFFF" numberOfLines={2} style={{ fontSize: 17, lineHeight: 21 }}>{title}</Text> : null}
        {subtitle ? <Text variant="caption" color="rgba(255,255,255,0.75)" numberOfLines={1}>{subtitle}</Text> : null}
        {footer}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale haptic="tap" onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ selected }}>
      {body}
    </PressableScale>
  );
}

/** "▮▮▯ Medium" difficulty bars for habit cards. */
export function Difficulty({ level }: { level: 1 | 2 | 3 }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={`Difficulty ${['easy', 'medium', 'hard'][level - 1]}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={{ width: 3, height: 4 + i * 3, borderRadius: 1, backgroundColor: i <= level ? '#FFFFFF' : 'rgba(255,255,255,0.3)' }} />
        ))}
      </View>
      <Text variant="micro" color="rgba(255,255,255,0.85)">{['Easy', 'Medium', 'Hard'][level - 1]}</Text>
    </View>
  );
}
