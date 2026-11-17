import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuraLayer, ExerciseMedia, type AuraState } from '@/features/visuals';
import { useTheme } from '@/theme';
import { Page, ScreenHeader, Text } from '@/ui';
import { Chips } from '@/ui/form';

const STATES: AuraState[] = ['idle', 'charging', 'power', 'surge', 'burst', 'embers', 'awakening'];
const RANKS = { E: '#6FA8FF', D: '#3DDC97', C: '#38C6F4', B: '#7C5CFF', A: '#FF4D6D', S: '#F5C451' } as const;

/** Dev-only "Aura lab" for locking the look during the pilot (VISUALS.md §3.6). Not reachable in release builds. */
export default function AuraLab() {
  const { c, spacing, radius } = useTheme();
  const [rank, setRank] = useState<keyof typeof RANKS>('E');
  const [exercise, setExercise] = useState('push-up');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Page header={<ScreenHeader title="Aura lab" />}>
      <Chips options={Object.keys(RANKS).map((r) => ({ value: r, label: r }))} value={[rank]} onToggle={(v) => setRank(v as keyof typeof RANKS)} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {STATES.map((s) => (
          <View key={s} style={{ width: '48%', height: 170, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border }}>
            <AuraLayer state={s} color={RANKS[rank]} />
            <Text variant="caption" style={{ position: 'absolute', left: 8, top: 6 }}>{s}</Text>
          </View>
        ))}
      </View>
      <Chips options={['push-up', 'bodyweight-squat', 'plank', 'pull-up', 'glute-bridge'].map((v) => ({ value: v, label: v }))} value={[exercise]} onToggle={setExercise} />
      <ExerciseMedia exerciseId={exercise} variant="hero" aura="power" />
    </Page>
  );
}
