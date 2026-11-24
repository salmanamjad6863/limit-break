import { routineIdOf, routineProblems, ROUTINE_LIMITS, type Routine, type RoutineDay, type RoutineSlot } from '@lb/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import {
  blankDay, exerciseById, exerciseName, useRoutine, useRoutineActions, useRoutineDraft, useTraining,
} from '@/features/training';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, Pill, PressableScale, ScreenHeader, Text } from '@/ui';
import { Segmented, Stepper, TextField } from '@/ui/form';

const WEEK = [1, 2, 3, 4, 5, 6, 0];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const SUPERSETS = ['A', 'B', 'C', 'D'];

const rangeText = (r: [number, number], unit = '') => (r[0] === r[1] ? `${r[0]}${unit}` : `${r[0]}–${r[1]}${unit}`);
const slotSummary = (s: RoutineSlot) =>
  [
    `${s.sets} × ${s.seconds ? rangeText(s.seconds, ' s') : rangeText(s.reps ?? [8, 12])}`,
    s.rir === 0 ? 'to failure' : `${s.rir} in reserve`,
    s.restSeconds ? `${s.restSeconds} s rest` : null,
    s.superset ? `superset ${s.superset}` : null,
  ].filter(Boolean).join(' · ');

/** Build or edit one routine: name, days with exact exercises and targets, and the weekday each day runs. */
export default function RoutineEditor() {
  const { c, spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useRoutine(id);
  const draft = useRoutineDraft((s) => s.draft);
  const dirty = useRoutineDraft((s) => s.dirty);
  const begin = useRoutineDraft((s) => s.begin);
  const update = useRoutineDraft((s) => s.update);
  const markSaved = useRoutineDraft((s) => s.saved);
  const clear = useRoutineDraft((s) => s.clear);
  const actions = useRoutineActions();
  const activeId = routineIdOf(useTraining((s) => s.activeProgramId));
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (draft?.id === id) return;
    if (existing) begin(existing);
    else router.back();
    // only when the screen opens for another routine
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!draft || draft.id !== id) return <Page header={<ScreenHeader title="Routine" />}><Text dim>Loading…</Text></Page>;
  const r = draft;
  const isNew = !existing;
  const isActive = activeId === r.id;
  const problems = routineProblems(r, (x) => exerciseById.has(x));

  const setDay = (dayId: string, fn: (d: RoutineDay) => RoutineDay) => update((x) => ({ ...x, days: x.days.map((d) => (d.id === dayId ? fn(d) : d)) }));
  const setSlot = (dayId: string, i: number, patch: Partial<RoutineSlot>) =>
    setDay(dayId, (d) => ({ ...d, slots: d.slots.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const moveSlot = (dayId: string, i: number, dir: -1 | 1) =>
    setDay(dayId, (d) => {
      const j = i + dir;
      if (j < 0 || j >= d.slots.length) return d;
      const slots = [...d.slots];
      [slots[i], slots[j]] = [slots[j]!, slots[i]!];
      return { ...d, slots };
    });
  const toggleWeekday = (dayId: string, wd: number) =>
    update((x) => {
      const schedule = { ...x.schedule };
      if (schedule[String(wd)] === dayId) delete schedule[String(wd)];
      else schedule[String(wd)] = dayId; // one workout per weekday: this moves it from another day
      return { ...x, schedule };
    });
  const removeDay = (dayId: string) =>
    update((x) => ({
      ...x,
      days: x.days.filter((d) => d.id !== dayId),
      schedule: Object.fromEntries(Object.entries(x.schedule).filter(([, v]) => v !== dayId)),
    }));
  const addDay = () =>
    update((x) => {
      const name = `Day ${LETTERS[x.days.length] ?? x.days.length + 1}`;
      return { ...x, days: [...x.days, blankDay(name, x.days.map((d) => d.id))] };
    });

  const leave = () => {
    if (!dirty) return router.back();
    Alert.alert('Discard changes?', 'Your edits to this routine haven’t been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { clear(); router.back(); } },
    ]);
  };
  const save = () => {
    const saved = actions.save({ ...r, name: r.name.trim(), days: r.days.map((d) => ({ ...d, name: d.name.trim() })) });
    markSaved(saved);
    return saved;
  };

  return (
    <Page
      header={
        <ScreenHeader title={isNew ? 'New routine' : 'Edit routine'} onBack={leave}
          right={!isNew ? (
            <PressableScale haptic="tap" accessibilityRole="button" accessibilityLabel="Delete routine"
              onPress={() => Alert.alert(`Delete ${r.name}?`, isActive ? 'It’s your active plan; the app will go back to its recommended program. Finished workouts stay in your history.' : 'Finished workouts stay in your history.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => { actions.remove(r.id); clear(); router.back(); } },
              ])}>
              <Icon name="trash-outline" size={20} color={c.danger} />
            </PressableScale>
          ) : undefined} />
      }
      footer={
        <View style={{ gap: spacing[2] }}>
          {problems.length && dirty ? <Text variant="caption" color={c.warning}>{problems[0]}</Text> : null}
          <Button label={dirty || isNew ? 'Save routine' : 'Saved'} icon="checkmark" disabled={!!problems.length || (!dirty && !isNew)} onPress={save} />
          {!isNew && !dirty ? (
            isActive
              ? <Pill icon="checkmark-circle" label="Your active plan" color={c.success} />
              : <Button variant="secondary" icon="play-circle-outline" label="Use this routine" onPress={() => { actions.activate(r); router.back(); }} />
          ) : null}
        </View>
      }>
      {dirty && !isNew ? <Text variant="caption" color={c.warning}>Unsaved changes</Text> : null}
      <TextField label="Routine name" value={r.name} onChangeText={(name) => update((x) => ({ ...x, name: name.slice(0, ROUTINE_LIMITS.nameLength) }))}
        placeholder="e.g. Push Pull Legs" autoCapitalize="words" returnKeyType="done" />

      {r.days.map((d) => (
        <DayCard key={d.id} day={d} routine={r} open={open} setOpen={setOpen}
          onRename={(name) => setDay(d.id, (x) => ({ ...x, name: name.slice(0, 40) }))}
          onToggleWeekday={(wd) => toggleWeekday(d.id, wd)}
          onSlot={(i, patch) => setSlot(d.id, i, patch)}
          onMove={(i, dir) => moveSlot(d.id, i, dir)}
          onRemoveSlot={(i) => setDay(d.id, (x) => ({ ...x, slots: x.slots.filter((_, k) => k !== i) }))}
          onRemoveDay={r.days.length > 1 ? () => removeDay(d.id) : undefined}
          onAdd={() => router.push({ pathname: '/routine/pick', params: { day: d.id } })} />
      ))}

      {r.days.length < ROUTINE_LIMITS.days ? <Button variant="ghost" size="md" icon="add-circle-outline" label="Add a day" onPress={addDay} /> : null}
      <Text variant="caption" muted>
        Suggested weights come from your best lifts and adjust set by set. Light and Intense on the workout screen still work. An exercise that hurts or clashes with an injury is swapped for a safe one.
      </Text>
    </Page>
  );
}

function DayCard(p: {
  day: RoutineDay;
  routine: Routine;
  open: string | null;
  setOpen: (k: string | null) => void;
  onRename: (name: string) => void;
  onToggleWeekday: (wd: number) => void;
  onSlot: (i: number, patch: Partial<RoutineSlot>) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onRemoveSlot: (i: number) => void;
  onRemoveDay?: () => void;
  onAdd: () => void;
}) {
  const { c, spacing, radius, type } = useTheme();
  const d = p.day;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <TextInput value={d.name} onChangeText={p.onRename} placeholder="Day name" placeholderTextColor={c.textMuted} accessibilityLabel="Day name"
          style={{ flex: 1, color: c.text, fontFamily: type.headline.font, fontSize: 20, paddingVertical: 4 }} />
        {p.onRemoveDay ? (
          <PressableScale haptic="tap" accessibilityRole="button" accessibilityLabel={`Remove ${d.name}`} onPress={p.onRemoveDay}>
            <Icon name="close-circle-outline" size={22} color={c.textMuted} />
          </PressableScale>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {WEEK.map((wd) => {
          const owner = p.routine.schedule[String(wd)];
          const on = owner === d.id;
          const other = owner && !on ? p.routine.days.find((x) => x.id === owner)?.name : null;
          return (
            <PressableScale key={wd} haptic="tap" onPress={() => p.onToggleWeekday(wd)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
              accessibilityLabel={`${d.name} on ${SHORT[wd]}${other ? `, now ${other}` : ''}`}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1.5,
                borderColor: on ? c.accent : c.border, backgroundColor: on ? `${c.accent}26` : other ? c.surfaceRaised : 'transparent' }}>
              <Text variant="micro" color={on ? c.text : other ? c.textDim : c.textMuted}>{SHORT[wd]}</Text>
            </PressableScale>
          );
        })}
      </View>

      {d.slots.length ? (
        d.slots.map((s, i) => {
          const key = `${d.id}:${i}`;
          const expanded = p.open === key;
          return (
            <View key={key} style={{ borderTopWidth: 1, borderColor: c.border, paddingTop: spacing[2], gap: spacing[2] }}>
              <PressableScale haptic="tap" onPress={() => p.setOpen(expanded ? null : key)} accessibilityRole="button"
                accessibilityLabel={`${exerciseName(s.exerciseId)}, ${slotSummary(s)}`} accessibilityState={{ expanded }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                <Text variant="caption" muted style={{ width: 18 }}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text variant="callout">{exerciseName(s.exerciseId)}</Text>
                  <Text variant="caption" muted>{slotSummary(s)}</Text>
                </View>
                <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={c.textMuted} />
              </PressableScale>
              {expanded ? <SlotEditor s={s} first={i === 0} last={i === d.slots.length - 1} onChange={(patch) => p.onSlot(i, patch)}
                onMove={(dir) => { p.onMove(i, dir); p.setOpen(`${d.id}:${i + dir}`); }} onRemove={() => { p.onRemoveSlot(i); p.setOpen(null); }} /> : null}
            </View>
          );
        })
      ) : (
        <Text variant="caption" muted>No exercises yet.</Text>
      )}
      <Button variant="secondary" size="md" icon="add" label="Add exercises" onPress={p.onAdd} />
    </Card>
  );
}

function SlotEditor({ s, first, last, onChange, onMove, onRemove }: {
  s: RoutineSlot; first: boolean; last: boolean; onChange: (patch: Partial<RoutineSlot>) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void;
}) {
  const { c, spacing } = useTheme();
  const timed = !!s.seconds;
  const range = s.seconds ?? s.reps ?? [8, 12];
  const setRange = (lo: number, hi: number) => {
    const next: [number, number] = [Math.min(lo, hi), Math.max(lo, hi)];
    onChange(timed ? { seconds: next } : { reps: next });
  };
  const unit = timed ? 's' : 'reps';
  const step = timed ? 5 : 1;
  const max = timed ? 600 : 100;
  return (
    <View style={{ gap: spacing[3], paddingBottom: spacing[2] }}>
      <Segmented options={[{ value: 'reps', label: 'Reps' }, { value: 'time', label: 'Time' }]} value={timed ? 'time' : 'reps'}
        onChange={(v) => onChange(v === 'time' ? { seconds: [30, 45], reps: undefined } : { reps: [8, 12], seconds: undefined })} />
      <Stepper label="Sets" value={s.sets} min={1} max={10} onChange={(sets) => onChange({ sets })} />
      <Stepper label={timed ? 'Seconds, from' : 'Reps, from'} value={range[0]} min={1} max={max} step={step} unit={unit}
        onChange={(v) => setRange(v, Math.max(v, range[1]))} />
      <Stepper label={timed ? 'Seconds, up to' : 'Reps, up to'} value={range[1]} min={1} max={max} step={step} unit={unit}
        onChange={(v) => setRange(Math.min(v, range[0]), v)} />
      <Stepper label="Reps in reserve" value={s.rir} min={0} max={5} onChange={(rir) => onChange({ rir })} format={(v) => (v === 0 ? 'Failure' : String(v))} />
      <Stepper label="Rest (auto = by exercise)" value={s.restSeconds ?? 0} min={0} max={600} step={15} onChange={(v) => onChange({ restSeconds: v || undefined })}
        format={(v) => (v ? `${v} s` : 'Auto')} />
      <View style={{ gap: spacing[2] }}>
        <Text variant="label" dim>Superset</Text>
        <Segmented options={[{ value: '-', label: 'None' }, ...SUPERSETS.map((x) => ({ value: x, label: x }))]} value={s.superset ?? '-'}
          onChange={(v) => onChange({ superset: v === '-' ? null : v })} />
        <Text variant="caption" muted>Exercises with the same letter alternate sets with short rest.</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <View style={{ flex: 1 }}><Button variant="ghost" size="md" icon="arrow-up" label="Up" disabled={first} onPress={() => onMove(-1)} /></View>
        <View style={{ flex: 1 }}><Button variant="ghost" size="md" icon="arrow-down" label="Down" disabled={last} onPress={() => onMove(1)} /></View>
        <View style={{ flex: 1 }}><Button variant="ghost" size="md" icon="trash-outline" label="Remove" onPress={onRemove} /></View>
      </View>
      {exerciseById.get(s.exerciseId)?.kind === 'time' && !timed ? <Text variant="caption" color={c.warning}>This exercise is usually timed.</Text> : null}
    </View>
  );
}
