import { Image } from 'expo-image';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useAwakeningPair } from '@/features/depth';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, ScreenHeader, Text } from '@/ui';

/** Side-by-side Before / After (SYSTEMS.md §6.1). Private only. */
export default function AwakeningFrameScreen() {
  const { c, spacing, radius } = useTheme();
  const { data, isLoading } = useAwakeningPair();
  const incomplete = data?.source === 'incomplete' || (!data?.before && !data?.after);

  return (
    <Page header={<ScreenHeader title="Awakening" />}>
      <Text variant="callout" dim>Your private Before / After. Tag photos as Before and After, or take two Progress shots.</Text>
      {isLoading ? <Text dim>Loading…</Text> : null}
      {incomplete && !isLoading ? (
        <Card>
          <Text variant="headline">Not enough photos yet</Text>
          <Text variant="callout" dim>Add a Before and an After (or two Progress photos) in your vault.</Text>
          <Button size="md" label="Open photo vault" icon="camera-outline" onPress={() => router.push('/progress/photos')} />
        </Card>
      ) : null}
      {!incomplete && data ? (
        <Card tint={c.accent}>
          <Text variant="label" color={c.accentGlow}>
            {data.source === 'tagged' ? 'Tagged pair' : 'Latest progress'}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Shot c={c} spacing={spacing} radius={radius} label="Before" url={data.before?.url ?? null} date={data.before?.localDate} />
            <Shot c={c} spacing={spacing} radius={radius} label="After" url={data.after?.url ?? null} date={data.after?.localDate} />
          </View>
          <Text variant="caption" muted>Only you can see this. It never posts to Community.</Text>
        </Card>
      ) : null}
    </Page>
  );
}

function Shot({
  c, spacing, radius, label, url, date,
}: {
  c: { surfaceRaised: string; textMuted: string };
  spacing: Record<number | string, number>;
  radius: { md: number };
  label: string;
  url: string | null;
  date?: string;
}) {
  return (
    <View style={{ flex: 1, gap: spacing[1] }}>
      <Text variant="heading">{label}</Text>
      <View style={{ aspectRatio: 3 / 4, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.surfaceRaised }}>
        {url ? (
          <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="image-outline" size={28} color={c.textMuted} />
          </View>
        )}
      </View>
      {date ? <Text variant="caption" muted>{date}</Text> : null}
    </View>
  );
}
