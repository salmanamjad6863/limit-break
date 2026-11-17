import { ANIMS, exerciseById } from '@lb/content';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuraLayer, TrainerFigure } from '@/features/visuals';
import { useTheme } from '@/theme';
import { Button, Page, Pill, PressableScale, ScreenHeader, Text } from '@/ui';

const IDS = Object.keys(ANIMS);

/** Dev-only "Trainer lab": review every exercise animation (VISUALS.md §3.10). */
export default function TrainerLab() {
  const { c, spacing, radius } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [i, setI] = useState(() => Math.max(0, IDS.indexOf(id ?? '')));
  const [w, setW] = useState(0);
  const [mirror, setMirror] = useState(false);
  if (!__DEV__) return <Redirect href="/" />;
  const ex = IDS[i]!;
  return (
    <Page header={<ScreenHeader title="Trainer lab" />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Button variant="secondary" size="md" icon="chevron-back" label="Prev" onPress={() => setI((x) => (x - 1 + IDS.length) % IDS.length)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="headline" numberOfLines={1}>{exerciseById.get(ex)?.name ?? ex}</Text>
          <Text variant="caption" muted>{`${i + 1} / ${IDS.length} · ${ex}`}</Text>
        </View>
        <Button variant="secondary" size="md" icon="chevron-forward" label="Next" onPress={() => setI((x) => (x + 1) % IDS.length)} />
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 320, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border }}>
        <AuraLayer state="power" />
        <TrainerFigure exerciseId={ex} width={w} height={320} mirrored={mirror} accent={c.accent} />
      </View>
      <PressableScale haptic="tap" onPress={() => setMirror((m) => !m)}><Pill label={mirror ? 'Mirrored (right side)' : 'Left side'} /></PressableScale>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {IDS.map((x, k) => (
          <PressableScale key={x} haptic="tap" onPress={() => setI(k)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: k === i ? c.accent : c.surface }}>
            <Text variant="micro" color={k === i ? '#FFFFFF' : c.textDim}>{x}</Text>
          </PressableScale>
        ))}
      </View>
    </Page>
  );
}
