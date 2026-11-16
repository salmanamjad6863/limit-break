import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Small status chip: streak, tags, metadata. */
export function Pill({ label, icon, color }: { label: string; icon?: IconName; color?: string }) {
  const { c, radius, spacing } = useTheme();
  const tint = color ?? c.textDim;
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
        paddingHorizontal: spacing[2] + 2, paddingVertical: 5, borderRadius: radius.pill,
        backgroundColor: `${tint}1A`,
      }}>
      {icon ? <Icon name={icon} size={13} color={tint} /> : null}
      <Text variant="micro" color={tint} style={{ fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
    </View>
  );
}
