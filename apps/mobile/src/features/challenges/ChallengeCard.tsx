import type { ChallengeDto } from '@lb/contracts';
import { addDays, challengeDayNumber, challengeProgress, taskTarget, type Challenge, type ChallengeTask } from '@lb/engine';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { exerciseName } from '@/features/training/catalog';
import { useTheme } from '@/theme';
import { Bar, Card, Icon, Pill, PressableScale, Text } from '@/ui';
import { useChallengeActions } from './api';

const UNIT: Record<string, string> = { reps: '', sec: ' s', min: ' min' };
const asEngine = (c: ChallengeDto): Challenge => ({ ...c, tasks: c.tasks as Challenge['tasks'] });

/** "28 push-ups", "45 s plank", or the habit's own name. */
export function taskLabel(t: ChallengeTask, dayNumber: number): string {
  if (t.kind === 'habit') return t.title;
  const target = taskTarget(t, dayNumber);
  const name = t.title || exerciseName(t.exerciseId ?? '');
  return t.unit === 'reps' || !t.unit ? `${target} × ${name}` : `${target}${UNIT[t.unit]} ${name}`;
}

const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function useChallengeProgress(c: ChallengeDto, today: string) {
  return useMemo(() => challengeProgress(asEngine(c), c.checkins, today), [c, today]);
}

/** One active challenge on the Quests tab: progress and today's check-list. */
export function ChallengeCard({ c, today }: { c: ChallengeDto; today: string }) {
  const { c: col, spacing, radius } = useTheme();
  const { toggle } = useChallengeActions();
  const p = useChallengeProgress(c, today);
  const yesterday = addDays(today, -1);
  const canFixYesterday = c.status === 'ACTIVE' && yesterday >= c.startDate && !c.tasks.every((t) => (c.checkins[yesterday] ?? []).includes(t.id));
  const [date, setDate] = useState(today);
  const day = date === today ? today : yesterday;
  const n = challengeDayNumber(c, day);
  const done = c.checkins[day] ?? [];
  const notStarted = challengeDayNumber(c, today) < 1;

  return (
    <Card tint={p.todayDone ? col.success : undefined}>
      <PressableScale haptic="tap" onPress={() => router.push(`/challenge/${c.id}`)} accessibilityRole="button" accessibilityLabel={`${c.name}, open challenge`}
        style={{ gap: spacing[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text variant="headline" style={{ flex: 1 }} numberOfLines={1}>{c.name}</Text>
          <Pill icon="flag-outline" label={notStarted ? `Starts ${shortDate(c.startDate)}` : `Day ${p.counted + (p.todayDone ? 0 : 1) > c.days ? c.days : p.counted + (p.todayDone ? 0 : 1)} of ${c.days}`} color={col.accentGlow} />
        </View>
        <Bar ratio={p.counted / c.days} color={p.todayDone ? col.success : col.accent} />
        <Text variant="caption" muted>
          {[
            `${p.counted}/${c.days} days`,
            c.graceDays ? `${p.graceLeft} grace day${p.graceLeft === 1 ? '' : 's'} left` : null,
            p.projectedEnd ? `ends ${shortDate(p.projectedEnd)}` : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      </PressableScale>

      {notStarted ? null : (
        <View style={{ gap: spacing[2] }}>
          {canFixYesterday ? (
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              {[{ v: today, l: 'Today' }, { v: yesterday, l: 'Yesterday' }].map((o) => (
                <PressableScale key={o.l} haptic="tap" onPress={() => setDate(o.v)} accessibilityRole="radio" accessibilityState={{ selected: day === o.v }}
                  style={{ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: day === o.v ? col.accent : col.border, backgroundColor: day === o.v ? `${col.accent}1F` : 'transparent' }}>
                  <Text variant="caption" color={day === o.v ? col.text : col.textDim}>{o.l}</Text>
                </PressableScale>
              ))}
            </View>
          ) : null}
          {c.tasks.map((t) => {
            const on = done.includes(t.id);
            return (
              <PressableScale key={t.id} haptic={on ? 'tap' : 'press'} onPress={() => toggle(c, day, t.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                accessibilityLabel={taskLabel(t as ChallengeTask, n)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 6 }}>
                <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? col.success : col.textMuted} />
                <Text variant="callout" color={on ? col.textDim : col.text} style={{ flex: 1, textDecorationLine: on ? 'line-through' : 'none' }}>
                  {taskLabel(t as ChallengeTask, n)}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      )}
    </Card>
  );
}
