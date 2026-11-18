import { router } from 'expo-router';
import { View } from 'react-native';
import { healthStatusLabel } from '@/features/health';
import { widgetsStatusLabel } from '@/features/depth';
import { useTheme } from '@/theme';
import { Card, Icon, Page, PressableScale, ScreenHeader, Text } from '@/ui';

const LINKS = [
  { href: '/progress/measurements', icon: 'body-outline' as const, title: 'Body measurements', sub: 'Waist, chest, arms — private to you' },
  { href: '/progress/photos', icon: 'camera-outline' as const, title: 'Progress photos', sub: 'Private vault · never posted to Community' },
  { href: '/progress/awakening', icon: 'git-compare-outline' as const, title: 'Awakening frame', sub: 'Before / after side by side' },
  { href: '/progress/debrief', icon: 'sparkles' as const, title: 'Weekly debrief', sub: 'The System’s private read on your week' },
];

/** Hub for Sprint 11 depth surfaces (SYSTEMS.md §6). */
export default function ProgressHub() {
  const { c, spacing } = useTheme();
  return (
    <Page header={<ScreenHeader title="Progress" />}>
      <Text variant="callout" dim>Weight, photos and measurements stay on your account. They never appear on ranks or the feed.</Text>
      {LINKS.map((l) => (
        <PressableScale key={l.href} haptic="tap" onPress={() => router.push(l.href as never)} accessibilityRole="button" accessibilityLabel={l.title}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <Icon name={l.icon} size={22} color={c.accentGlow} />
              <View style={{ flex: 1 }}>
                <Text variant="headline">{l.title}</Text>
                <Text variant="caption" muted>{l.sub}</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={c.textMuted} />
            </View>
          </Card>
        </PressableScale>
      ))}
      <Card>
        <Text variant="label" color={c.mana}>Health sync</Text>
        <Text variant="callout" dim>{healthStatusLabel()}</Text>
        <Text variant="caption" muted style={{ marginTop: spacing[2] }}>{widgetsStatusLabel()}</Text>
      </Card>
    </Page>
  );
}
