import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon } from './Icon';
import { PressableScale } from './motion/PressableScale';
import { Text } from './Text';

/** Compact header for pushed / modal screens. */
export function ScreenHeader({
  title,
  icon = 'chevron-back',
  onBack,
  right,
}: {
  title?: string;
  icon?: 'chevron-back' | 'close';
  onBack?: () => void;
  right?: ReactNode;
}) {
  const { c, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[2], minHeight: 48 }}>
      <PressableScale
        haptic="tap"
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        accessibilityRole="button"
        accessibilityLabel={icon === 'close' ? 'Close' : 'Back'}
        style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised }}>
        <Icon name={icon} size={20} color={c.text} />
      </PressableScale>
      <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>{title ?? ''}</Text>
      {right}
    </View>
  );
}
