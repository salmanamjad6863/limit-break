import type { LoggedSetInput } from '@lb/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { exerciseName, useEditable, useHistoryActions, useWorkoutDetail } from '@/features/training';
import { newId } from '@/lib/id';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, PressableScale, ScreenHeader, Text } from '@/ui';
import { TextField } from '@/ui/form';

const NEXT_TYPE = { normal: 'drop', drop: 'failure', failure: 'normal' } as const;

/** Fix a finished workout within 7 days: weights, reps, set types, add/remove sets, notes. XP updates as a diff. */
export default function EditWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, spacing, radius, type } = useTheme();
  const { data: w } = useWorkoutDetail(id);
  const editable = useEditable(w);
  const { edit } = useHistoryActions();
  const [sets, setSets] = useState<LoggedSetInput[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  if (!w) return <Page header={<ScreenHeader title="Edit" />}><Text dim>Loading…</Text></Page>;
  const cur = sets ?? w.sets;
  const note = notes ?? w.notes ?? '';
  const patch = (i: number, p: Partial<LoggedSetInput>) => setSets(cur.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v.replace(',', '.')) || 0));
  const exerciseOrder = [...new Set(cur.map((s) => s.exerciseId))];

  const field = (value: number | null, onChange: (v: string) => void, label: string, width = 64) => (
    <TextInput value={value == null ? '' : String(value)} onChangeText={onChange} keyboardType="decimal-pad" accessibilityLabel={label} placeholder="–" placeholderTextColor={c.textMuted}
      style={{ width, color: c.text, fontFamily: type.headline.font, fontSize: 16, textAlign: 'center', paddingVertical: 8, borderRadius: radius.sm, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} />
  );

  return (
    <Page header={<ScreenHeader title="Edit workout" />}
      footer={<Button label="Save changes" icon="checkmark" disabled={!editable} loading={edit.isPending}
        onPress={() => edit.mutate({ id: w.id, sets: cur, notes: note.trim() || null, sessionRpe: w.sessionRpe }, { onSuccess: () => router.back() })} />}>
      <Text variant="caption" muted>XP, personal records and stats recalculate from the corrected sets.</Text>
      {exerciseOrder.map((ex) => (
        <Card key={ex}>
          <Text variant="headline">{exerciseName(ex)}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Text variant="micro" muted style={{ width: 58, textAlign: 'center' }}>KG</Text>
            <Text variant="micro" muted style={{ width: 48, textAlign: 'center' }}>REPS</Text>
            <Text variant="micro" muted style={{ flex: 1, textAlign: 'center' }}>TYPE (TAP)</Text>
            <View style={{ width: 24 }} />
          </View>
          {cur.map((s, i) => (s.exerciseId !== ex ? null : (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {s.isWarmup ? <Text variant="label" muted>W</Text> : null}
              {field(s.weightKg, (v) => patch(i, { weightKg: num(v) }), 'Weight in kg', 58)}
              {field(s.reps, (v) => patch(i, { reps: num(v) == null ? null : Math.round(num(v)!) }), 'Reps', 48)}
              <PressableScale haptic="tap" onPress={() => patch(i, { setType: NEXT_TYPE[s.setType] })} accessibilityRole="button" accessibilityLabel={`Set type ${s.setType}`}
                style={{ flex: 1, minWidth: 56, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm, backgroundColor: s.setType === 'normal' ? c.surfaceRaised : s.setType === 'drop' ? `${c.mana}26` : `${c.danger}26` }}>
                <Text variant="caption" numberOfLines={1} color={s.setType === 'normal' ? c.textDim : c.text}>{s.setType === 'normal' ? 'Normal' : s.setType === 'drop' ? 'Drop' : 'Failure'}</Text>
              </PressableScale>
              <PressableScale haptic="tap" onPress={() => setSets(cur.filter((_, k) => k !== i))} accessibilityRole="button" accessibilityLabel="Remove set" style={{ padding: 2 }}>
                <Icon name="close-circle" size={20} color={c.textMuted} />
              </PressableScale>
            </View>
          )))}
          <Button variant="ghost" size="md" icon="add" label="Add set"
            onPress={() => {
              const last = [...cur].reverse().find((s) => s.exerciseId === ex)!;
              const at = cur.lastIndexOf(last) + 1;
              setSets([...cur.slice(0, at), { ...last, id: newId(), isWarmup: false, setType: 'normal', order: last.order + 1 }, ...cur.slice(at)]);
            }} />
        </Card>
      ))}
      <TextField label="Notes" placeholder="How it felt, what to change next time" value={note} onChangeText={setNotes} multiline />
      {edit.isError ? <Text variant="caption" color={c.warning}>Couldn’t save. Workouts lock 7 days after the session.</Text> : null}
    </Page>
  );
}
