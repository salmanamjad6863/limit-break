import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon, type IconName } from '../Icon';
import { PressableScale } from '../motion/PressableScale';
import { Text } from '../Text';

type Variant = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  size = 'lg',
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  size?: 'md' | 'lg';
}) {
  const { c, radius, spacing } = useTheme();
  const height = size === 'lg' ? 54 : 44;
  const fg = variant === 'primary' ? '#FFFFFF' : variant === 'secondary' ? c.text : c.accentGlow;
  const content = (
    <View style={{ height, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingHorizontal: spacing[5] }}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text variant="heading" color={fg}>{label}</Text>
    </View>
  );
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      scaleTo={0.97}
      style={{ opacity: disabled ? 0.4 : 1, borderRadius: radius.md }}>
      {variant === 'primary' ? (
        <LinearGradient
          colors={['#8B6DFF', c.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ borderRadius: radius.md, boxShadow: `0 8px 24px ${c.accent}40` }}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={{
            borderRadius: radius.md,
            backgroundColor: variant === 'secondary' ? c.surfaceRaised : 'transparent',
            borderWidth: variant === 'secondary' ? 1 : 0,
            borderColor: c.border,
          }}>
          {content}
        </View>
      )}
    </PressableScale>
  );
}
