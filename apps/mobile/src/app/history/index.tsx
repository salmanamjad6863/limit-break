import type { WorkoutSummaryDto } from '@lb/contracts';
import { gameDate } from '@lb/engine';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTrainingProfile, useWorkoutHistory } from '@/features/training';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, Pill, PressableScale, ScreenHeader, Text } from '@/ui';

const DAY = 86_400_000;
const shift = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Calendar (5 weeks) + list of every session — SYSTEMS.md §3.11. */
export default function History() {
  const { c, spacing, radius } = useTheme();
  const tz = useTrainingProfile().timezone || 'UTC';
  const today = gameDate(new Date(), tz);
  const { workouts, isLoading } = useWorkoutHistory();
  const [day, setDay] = useState<string | null>(null);
  const [limit, setLimit] = useState(30);
  const byDate = useMemo(() => {
    const m = new Map<string, WorkoutSummaryDto[]>();
    for (const w of workouts) m.set(w.date, [...(m.get(w.date) ?? []), w]);
    return m;
  }, [workouts]);
  // Monday-first grid ending this week
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = shift(today, -weekday - 28);
  const cells = Array.from({ length: 35 }, (_, i) => shift(start, i));
  const all = day ? workouts.filter((w) => w.date === day) : workouts;
  const shown = all.slice(0, limit);
  const sessions28 = workouts.filter((w) => w.date > shift(today, -28)).length;

  return (
    <Page header={<ScreenHeader title="History" />}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => <Text key={i} variant="micro" muted style={{ width: '13%', textAlign: 'center' }}>{l}</Text>)}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, justifyContent: 'space-between' }}>
          {cells.map((d) => {
            const list = byDate.get(d) ?? [];
            const kind = list.some((w) => w.kind === 'program') ? c.accent : list.length ? c.mana : null;
            const on = day === d;
            const future = d > today;
            return (
              <PressableScale key={d} haptic="tap" disabled={future || !list.length} onPress={() => setDay(on ? null : d)} accessibilityRole="button"
                accessibilityLabel={`${nice(d)}${list.length ? `, ${list.length} session${list.length > 1 ? 's' : ''}` : ''}`}
                style={{ width: '13%', aspectRatio: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', gap: 2,
                  backgroundColor: on ? `${c.accent}33` : kind ? `${kind}1F` : 'transparent', borderWidth: d === today ? 1.5 : 0, borderColor: c.accentGlow, opacity: future ? 0.3 : 1 }}>
                <Text variant="caption" color={kind ? c.text : c.textMuted}>{String(Number(d.slice(8)))}</Text>
                {kind ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: kind }} /> : null}
              </PressableScale>
            );
          })}
        </View>
        <Text variant="caption" muted>{`${sessions28} session${sessions28 === 1 ? '' : 's'} in the last 4 weeks`}</Text>
      </Card>

      <Button variant="secondary" size="md" icon="add-circle-outline" label="Log a workout" onPress={() => router.push('/history/log')} />
      {day ? <Pill icon="close" label={`${nice(day)} · show all`} color={c.accentGlow} /> : null}
      {isLoading ? <Text dim>Loading…</Text> : null}
      {!isLoading && !shown.length ? (
        <Card><Text variant="callout" dim>No sessions yet. Your first workout will appear here with every set.</Text></Card>
      ) : null}
      {shown.length ? (
        <Card padded={false}>
          {shown.map((w, i) => (
            <PressableScale key={w.id} haptic="tap" onPress={() => router.push(`/history/${w.id}`)} accessibilityRole="button" accessibilityLabel={`${w.name}, ${nice(w.date)}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                <Icon name={w.kind === 'manual' ? 'create-outline' : w.kind === 'quick' ? 'flash-outline' : 'barbell-outline'} size={18} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="callout" numberOfLines={1}>{w.name}</Text>
                  <Text variant="caption" muted numberOfLines={1}>
                    {`${nice(w.date)} · ${Math.round(w.minutes)} min${w.workingSets ? ` · ${w.workingSets} sets` : ''}${w.prs.length ? ` · ${w.prs.length} PR` : ''}${w.source === 'manual' ? ' · logged after' : ''}`}
                  </Text>
                </View>
                <Text variant="callout" color={c.accentGlow}>{`+${w.xp}`}</Text>
                <Icon name="chevron-forward" size={16} color={c.textMuted} />
              </View>
            </PressableScale>
          ))}
        </Card>
      ) : null}
      {all.length > shown.length ? <Button variant="ghost" size="md" label={`Show more (${all.length - shown.length})`} onPress={() => setLimit((l) => l + 30)} /> : null}
    </Page>
  );
}
