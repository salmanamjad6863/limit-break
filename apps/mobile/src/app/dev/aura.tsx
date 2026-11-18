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
  const { c, radius } = useTheme();
  const [rank, setRank] = useState<keyof typeof RANKS>('E');
  const [exercise, setExercise] = useState('push-up');
  const [state, setState] = useState<AuraState>('power');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Page header={<ScreenHeader title="Aura lab" />}>
      <Chips options={Object.keys(RANKS).map((r) => ({ value: r, label: r }))} value={[rank]} onToggle={(v) => setRank(v as keyof typeof RANKS)} />
      {/* one live shader at a time: several full-size fbm shaders saturate the simulator's main thread and freeze touches */}
      <Chips options={STATES.map((s) => ({ value: s, label: s }))} value={[state]} onToggle={(v) => setState(v as AuraState)} />
      <View style={{ height: 260, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border }}>
        <AuraLayer state={state} color={RANKS[rank]} />
        <Text variant="caption" style={{ position: 'absolute', left: 8, top: 6 }}>{state}</Text>
      </View>
      <Chips options={['push-up', 'bodyweight-squat', 'plank', 'pull-up', 'glute-bridge'].map((v) => ({ value: v, label: v }))} value={[exercise]} onToggle={setExercise} />
      <ExerciseMedia exerciseId={exercise} variant="hero" aura={state} />
    </Page>
  );
}
