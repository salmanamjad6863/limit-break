import { cosmetics } from '@lb/content';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Page, ScreenHeader, Text } from '@/ui';
import { Chips } from '@/ui/form';
import { FrameRing, type FrameStyle } from '@/ui/fx';

const frames = cosmetics.filter((c) => c.slot === 'frame' && c.style && c.colors);
const PAGES = ['1', '2', '3'];

/** Dev-only frame gallery: every frame, eight per page (the web preview caps live canvases). Not reachable in release builds. */
export default function FrameLab() {
  const { c, spacing } = useTheme();
  const [page, setPage] = useState('1');
  if (!__DEV__) return <Redirect href="/" />;
  const shown = frames.slice((Number(page) - 1) * 8, Number(page) * 8);
  return (
    <Page header={<ScreenHeader title="Frame lab" />}>
      <Chips options={PAGES.map((p) => ({ value: p, label: `Page ${p}` }))} value={[page]} onToggle={setPage} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        {shown.map((f) => (
          <View key={f.id} style={{ width: 150, alignItems: 'center', gap: 4 }}>
            <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ position: 'absolute', width: 84, height: 84, borderRadius: 42, backgroundColor: `${c.accent}22` }} />
              <FrameRing style={f.style as FrameStyle} colors={f.colors!} size={120} />
            </View>
            <Text variant="caption">{f.name}</Text>
            <Text variant="micro" muted>{f.style}</Text>
          </View>
        ))}
      </View>
    </Page>
  );
}
