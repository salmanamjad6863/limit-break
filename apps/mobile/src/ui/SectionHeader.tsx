import { View } from 'react-native';
import { useTheme } from '@/theme';
import { PressableScale } from './motion/PressableScale';
import { Text } from './Text';

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { c, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -spacing[1] }}>
      <Text variant="headline">{title}</Text>
      {action ? (
        <PressableScale haptic="tap" onPress={onAction} accessibilityRole="button" accessibilityLabel={action}>
          <Text variant="callout" color={c.accentGlow}>{action}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
