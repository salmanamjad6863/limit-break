import type { ManualWorkoutInput } from '@lb/contracts';
import { gameDate } from '@lb/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useHistoryActions, useTrainingProfile } from '@/features/training';
import { useTheme } from '@/theme';
import { Button, Card, Page, PressableScale, ScreenHeader, Text } from '@/ui';
import { Segmented, TextField } from '@/ui/form';

const TYPES: { value: ManualWorkoutInput['type']; label: string; name: string }[] = [
  { value: 'strength', label: 'Gym', name: 'Gym session' }, { value: 'cardio', label: 'Cardio', name: 'Run' },
  { value: 'sport', label: 'Sport', name: 'Football' }, { value: 'class', label: 'Class', name: 'Yoga class' }, { value: 'other', label: 'Other', name: 'Hike' },
];
const shift = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

/** Training done without the app (SYSTEMS.md §3.11): real-minutes XP, counts for streaks, never for leaderboards. */
export default function LogWorkout() {
  const { c, spacing, radius } = useTheme();
  const today = gameDate(new Date(), useTrainingProfile().timezone || 'UTC');
  const { logManual } = useHistoryActions();
  const [t, setT] = useState<ManualWorkoutInput['type']>('strength');
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('45');
  const [rpe, setRpe] = useState(7);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const m = Math.round(Number(minutes) || 0);
  const label = name.trim() || TYPES.find((x) => x.value === t)!.name;
  const valid = m >= 5 && m <= 300 && label.length >= 2;
  const days = Array.from({ length: 7 }, (_, i) => shift(today, -i));

  return (
    <Page header={<ScreenHeader title="Log a workout" />}
      footer={<Button label="Save" icon="checkmark" disabled={!valid} loading={logManual.isPending}
        onPress={() => logManual.mutate({ type: t, name: label, minutes: m, rpe, localDate: date, distanceKm: null, notes: notes.trim() || null }, { onSuccess: () => router.back() })} />}>
      <Text variant="caption" muted>For training done without the app. It earns XP for real minutes and keeps your streak, but doesn’t count on leaderboards.</Text>
      <Segmented options={TYPES.map((x) => ({ value: x.value, label: x.label }))} value={t} onChange={setT} />
      <TextField label="What did you do?" placeholder={TYPES.find((x) => x.value === t)!.name} value={name} onChangeText={setName} />
      <TextField label="Minutes" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
      <Text variant="label" muted>How hard was it?</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[3, 5, 7, 8, 9, 10].map((r) => {
          const on = rpe === r;
          return (
            <PressableScale key={r} haptic="tap" onPress={() => setRpe(r)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Effort ${r} out of 10`}
              style={{ flex: 1, alignItems: 'center', paddingVertical: spacing[3], borderRadius: radius.md, backgroundColor: on ? c.accent : c.surfaceRaised }}>
              <Text variant="headline" color={on ? '#FFFFFF' : c.text}>{String(r)}</Text>
            </PressableScale>
          );
        })}
      </View>
      <Text variant="caption" muted>{rpe <= 3 ? 'Easy: could chat the whole time.' : rpe <= 5 ? 'Moderate: steady, a little out of breath.' : rpe <= 7 ? 'Hard: talking in short sentences.' : rpe <= 9 ? 'Very hard: a few words at a time.' : 'All-out.'}</Text>
      <Text variant="label" muted>When?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {days.map((d, i) => {
          const on = date === d;
          return (
            <PressableScale key={d} haptic="tap" onPress={() => setDate(d)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={d}
              style={{ paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? c.accent : c.border, backgroundColor: on ? `${c.accent}1F` : c.surfaceRaised }}>
              <Text variant="callout" color={on ? c.text : c.textDim}>{i === 0 ? 'Today' : i === 1 ? 'Yesterday' : new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</Text>
            </PressableScale>
          );
        })}
      </View>
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
      {logManual.isError ? <Card tint={c.warning}><Text variant="callout">Couldn’t save. Manual logs are for the last 7 days.</Text></Card> : null}
    </Page>
  );
}
