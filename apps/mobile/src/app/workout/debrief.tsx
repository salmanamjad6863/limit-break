import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { exerciseName, toFinishInput, useFinishWorkout, useWorkoutSession, type FinishSummary } from '@/features/training';
import { useTheme } from '@/theme';
import { TextField } from '@/ui/form';
import { Appear, Button, Card, CountUp, Icon, Page, PressableScale, ScreenHeader, Text } from '@/ui';

const RPE = [
  { v: 5, label: 'Easy' },
  { v: 7, label: 'Solid' },
  { v: 8, label: 'Hard' },
  { v: 9, label: 'Very hard' },
  { v: 10, label: 'Max' },
];

/** Session summary → one finish call → celebrations (PLAN.md §5.7 step 7). */
export default function Debrief() {
  const { c, spacing, radius } = useTheme();
  const active = useWorkoutSession((s) => s.active);
  const end = useWorkoutSession((s) => s.end);
  const freezeFinish = useWorkoutSession((s) => s.freezeFinish);
  const finish = useFinishWorkout();
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<FinishSummary | null>(null);

  const stats = useMemo(() => {
    if (!active) return null;
    const entries = Object.entries(active.logs).flatMap(([k, list]) => list.map((e) => ({ ...e, exerciseId: active.exercises[Number(k)]!.exerciseId })));
    const working = entries.filter((e) => !e.isWarmup);
    return {
      sets: working.length,
      volume: Math.round(working.reduce((v, e) => v + (e.loadKg ?? 0) * (e.reps ?? 0), 0)),
      minutes: Math.max(1, Math.round((Date.now() - Date.parse(active.startedAt)) / 60000)),
      exercises: new Set(working.map((e) => e.exerciseId)).size,
    };
  }, [active]);

  if (!active && !result) return <Redirect href="/train" />;

  const done = () => {
    end();
    router.replace('/train');
  };

  if (result) {
    return (
      <Page header={<ScreenHeader title="Workout complete" icon="close" onBack={done} />} footer={<Button label="Done" onPress={done} />}>
        <Appear index={0} style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[4] }}>
          <Icon name="trophy" size={44} color="#F5C451" />
          <Text variant="label" color={c.accentGlow}>Gate cleared</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] }}>
            <Text variant="title" color={c.accentGlow}>+</Text>
            <CountUp variant="stat" value={result.xp} style={{ fontSize: 56, lineHeight: 60 }} color={c.accentGlow} />
            <Text variant="headline" color={c.accentGlow}>XP</Text>
          </View>
          {result.capped ? <Text variant="caption" color={c.warning}>Daily XP limit reached. Rest is also training.</Text> : null}
        </Appear>
        <Appear index={1}>
          <Card>
            <StatGrid items={[['Time', `${result.minutes} min`], ['Working sets', String(result.workingSets)], ['Volume', `${result.volumeKg.toLocaleString()} kg`]]} />
          </Card>
        </Appear>
        {result.prs.length ? (
          <Appear index={2}>
            <Card tint="#F5C451">
              <Text variant="heading">New personal records</Text>
              {result.prs.map((p) => (
                <View key={p.exerciseId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="callout">{exerciseName(p.exerciseId)}</Text>
                  <Text variant="callout" color="#F5C451">{`e1RM ${p.e1rmKg} kg`}</Text>
                </View>
              ))}
            </Card>
          </Appear>
        ) : null}
        <Appear index={3}>
          <Card>
            <Text variant="heading">Next time</Text>
            <Text variant="callout" dim>
              The coach uses today's reps and effort to set your next loads. Hit the top of the rep range at your target effort
              and the weight goes up.
            </Text>
          </Card>
        </Appear>
      </Page>
    );
  }

  return (
    <Page
      header={<ScreenHeader title="Finish workout" onBack={() => router.replace('/workout/session')} />}
      footer={
        <>
          {finish.error ? <Text variant="caption" color={c.danger}>Couldn't save. Check your connection and try again.</Text> : null}
          <Button
            label={finish.isPending ? 'Saving…' : 'Save workout'}
            icon="checkmark"
            loading={finish.isPending}
            disabled={!stats || stats.sets === 0}
            // finishedAt is frozen on the first tap: a retry after the 03:00 rollover keeps the same game day
            onPress={() => active && finish.mutate({ session: active, input: toFinishInput({ ...active, notes, finishedAt: freezeFinish() }, rpe) }, {
              // end the live session as soon as it's saved, so leaving the results screen can never re-save it
              onSuccess: (r) => { setResult(r); end(); },
            })}
          />
          {stats?.sets === 0 ? <Text variant="caption" muted style={{ textAlign: 'center' }}>Log at least one working set to save.</Text> : null}
        </>
      }>
      <Text variant="title">{active!.name}</Text>
      {stats ? (
        <Card>
          <StatGrid items={[['Time', `${stats.minutes} min`], ['Working sets', String(stats.sets)], ['Volume', `${stats.volume.toLocaleString()} kg`]]} />
        </Card>
      ) : null}
      <Card>
        <Text variant="heading">How hard was that overall?</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {RPE.map((r) => (
            <PressableScale
              key={r.v}
              haptic="tap"
              onPress={() => setRpe(r.v)}
              accessibilityRole="radio"
              accessibilityState={{ selected: rpe === r.v }}
              accessibilityLabel={`Effort ${r.v}, ${r.label}`}
              style={{ flex: 1, alignItems: 'center', paddingVertical: spacing[3], borderRadius: radius.md, backgroundColor: rpe === r.v ? c.accent : c.surfaceRaised }}>
              <Text variant="heading" color={rpe === r.v ? '#FFFFFF' : c.text}>{r.v}</Text>
              <Text variant="micro" color={rpe === r.v ? '#FFFFFF' : c.textMuted}>{r.label}</Text>
            </PressableScale>
          ))}
        </View>
        <Text variant="caption" muted>Session RPE helps the coach spot fatigue and plan deloads.</Text>
      </Card>
        <TextField label="Notes (optional)" placeholder="How it felt, what to change next time" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
    </Page>
  );
}

function StatGrid({ items }: { items: [string, string][] }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing[2] }}>
      {items.map(([k, v]) => (
        <View key={k} style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" muted>{k}</Text>
          <Text variant="headline">{v}</Text>
        </View>
      ))}
    </View>
  );
}
