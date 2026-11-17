import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { exerciseName, useEditable, useHistoryActions, useWorkoutDetail } from '@/features/training';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, Pill, ScreenHeader, Text } from '@/ui';

const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/** One session: every set, PRs, notes; edit or delete within 7 days. */
export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, spacing } = useTheme();
  const { data: w, isLoading } = useWorkoutDetail(id);
  const editable = useEditable(w);
  const { remove } = useHistoryActions();
  const [confirm, setConfirm] = useState(false);
  if (!w) return <Page header={<ScreenHeader title="Workout" />}><Text dim>{isLoading ? 'Loading…' : 'Workout not found.'}</Text></Page>;

  // group sets by exercise, in the order they were done
  const groups: { exerciseId: string; sets: typeof w.sets }[] = [];
  for (const s of w.sets) {
    const g = groups.find((x) => x.exerciseId === s.exerciseId);
    if (g) g.sets.push(s);
    else groups.push({ exerciseId: s.exerciseId, sets: [s] });
  }
  const prIds = new Set(w.prs.map((p) => p.exerciseId));

  return (
    <Page header={<ScreenHeader title={w.name} />}
      footer={editable ? (
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {w.sets.length ? <View style={{ flex: 1 }}><Button variant="secondary" size="md" icon="create-outline" label="Edit" onPress={() => router.push(`/history/edit/${w.id}`)} /></View> : null}
          <View style={{ flex: 1 }}>
            <Button variant={confirm ? 'primary' : 'secondary'} size="md" icon="trash-outline" label={confirm ? `Delete (−${w.xp} XP)` : 'Delete'} loading={remove.isPending}
              onPress={() => (confirm ? remove.mutate(w.id, { onSuccess: () => router.back() }) : setConfirm(true))} />
          </View>
        </View>
      ) : undefined}>
      <Text variant="callout" dim>{nice(w.date)}</Text>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {[
            { k: 'Minutes', v: String(Math.round(w.minutes)) },
            { k: 'Sets', v: String(w.workingSets) },
            { k: 'Volume', v: `${w.volumeKg.toLocaleString()} kg` },
            { k: 'XP', v: `+${w.xp}` },
          ].map((x) => (
            <View key={x.k} style={{ alignItems: 'center', flex: 1, gap: 2 }}>
              <Text variant="headline">{x.v}</Text>
              <Text variant="caption" muted>{x.k}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
          {w.source === 'manual' ? <Pill icon="create-outline" label="Logged after · not on leaderboards" /> : null}
          {w.sessionRpe ? <Pill label={`Effort ${w.sessionRpe}/10`} /> : null}
          {w.prs.length ? <Pill icon="trophy" label={`${w.prs.length} PR${w.prs.length > 1 ? 's' : ''}`} color={c.warning} /> : null}
        </View>
      </Card>
      {w.notes ? (
        <Card>
          <Text variant="label" muted>Notes</Text>
          <Text variant="callout">{w.notes}</Text>
        </Card>
      ) : null}
      {groups.map((g) => (
        <Card key={g.exerciseId}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Text variant="headline" style={{ flex: 1 }}>{exerciseName(g.exerciseId)}</Text>
            {prIds.has(g.exerciseId) ? <Pill icon="trophy" label="PR" color={c.warning} /> : null}
          </View>
          {g.sets.map((s, i) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <Text variant="label" muted style={{ width: 28 }}>{s.isWarmup ? 'W' : String(g.sets.filter((x, k) => !x.isWarmup && k <= i).length)}</Text>
              <Text variant="callout" style={{ flex: 1 }} color={s.isWarmup ? c.textDim : c.text}>
                {s.durationS != null && s.reps == null ? `${s.durationS}s` : `${s.weightKg != null ? `${s.weightKg} kg × ` : ''}${s.reps ?? 0}`}
                {s.rir != null ? <Text variant="caption" muted>{`  · ${s.rir} in reserve`}</Text> : null}
              </Text>
              {s.setType !== 'normal' ? <Pill label={s.setType === 'drop' ? 'Drop set' : 'To failure'} color={s.setType === 'drop' ? c.mana : c.danger} /> : null}
            </View>
          ))}
        </Card>
      ))}
      {!editable ? (
        <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}>
          <Icon name="lock-closed-outline" size={14} color={c.textMuted} />
          <Text variant="caption" muted>Workouts lock 7 days after the session so leaderboards stay fair.</Text>
        </View>
      ) : null}
    </Page>
  );
}
