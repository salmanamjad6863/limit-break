import { gameDate } from '@lb/engine';
import { router } from 'expo-router';
import { View } from 'react-native';
import { exerciseName, quickSessions, useToday, useTraining, useTrainingProfile, useWorkoutSession, workoutTypes } from '@/features/training';
import { useTheme } from '@/theme';
import { Appear, Button, Card, Icon, Pill, PressableScale, Screen, SectionHeader, Text } from '@/ui';

export default function TrainScreen() {
  const { c, spacing, radius } = useTheme();
  const profile = useTrainingProfile();
  const today = useToday();
  const history = useTraining((s) => s.history);
  const completed = useTraining((s) => s.completedSessions);
  const active = useWorkoutSession((s) => s.active);
  const type = workoutTypes.find((t) => t.id === today.program.typeId);
  const w = today.workout;
  const doneToday = history.some((h) => h.kind === 'program' && h.date === gameDate(new Date(), profile.timezone || 'UTC'));

  return (
    <Screen title="Train" subtitle="Your program, coached set by set." accent={type?.color ?? c.danger}>
      {/* Program */}
      <Appear index={1}>
        <PressableScale haptic="tap" onPress={() => router.push('/programs')} accessibilityRole="button" accessibilityLabel="Change program">
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${type?.color ?? c.accent}22` }}>
                <Icon name={(type?.icon ?? 'barbell') as never} size={22} color={type?.color ?? c.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="caption" muted>Current program</Text>
                <Text variant="headline">{today.program.name}</Text>
                <Text variant="caption" dim>{`Day ${today.dayIndex + 1} of ${today.program.days.length} · ${completed} ${completed === 1 ? 'session' : 'sessions'} done`}</Text>
              </View>
              <Text variant="callout" color={c.accentGlow}>Change</Text>
            </View>
          </Card>
        </PressableScale>
      </Appear>

      {/* Today */}
      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title={active ? 'In progress' : doneToday ? 'Done today' : today.isTrainingDay ? "Today's workout" : 'Rest day'} />
        {active ? (
          <Card tint={c.accent}>
            <Text variant="headline">{active.name}</Text>
            <Text variant="callout" dim>Your workout is saved. Pick up right where you left off.</Text>
            <Button label="Resume workout" icon="play" onPress={() => router.push('/workout/session')} />
          </Card>
        ) : today.isTrainingDay && !doneToday ? (
          <Card tint={type?.color}>
            <Text variant="headline">{w.name}</Text>
            <View style={{ flexDirection: 'row', gap: spacing[4] }}>
              <Meta icon="time-outline" text={`~${w.estimatedMinutes} min`} />
              <Meta icon="list-outline" text={`${w.exercises.length} exercises`} />
            </View>
            <Text variant="caption" muted numberOfLines={2}>{w.exercises.map((e) => exerciseName(e.exerciseId)).join(' · ')}</Text>
            <Button label="Start workout" icon="play" onPress={() => router.push('/workout/preview')} />
          </Card>
        ) : (
          <Card tint={c.mana}>
            <Text variant="headline">{doneToday ? 'Great work today.' : 'Recovery is part of the plan.'}</Text>
            <Text variant="callout" dim>
              {doneToday ? 'Muscles grow while you rest. A short mobility session helps.' : 'A 10-minute mobility flow keeps your streak and your joints happy.'}
            </Text>
            <Button variant="secondary" icon="leaf-outline" label="10-minute mobility" onPress={() => router.push('/workout/quick/mobility-10')} />
            {!doneToday ? <Button variant="ghost" size="md" label={`Train anyway: ${w.name}`} onPress={() => router.push('/workout/preview')} /> : null}
          </Card>
        )}
      </Appear>

      {/* Week */}
      <Appear index={3} style={{ gap: spacing[3] }}>
        <SectionHeader title="This week" />
        <Card padded={false}>
          {today.week.map((d, i) => (
            <View
              key={d.weekday}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3],
                borderTopWidth: i ? 1 : 0, borderColor: c.border, backgroundColor: d.isToday ? `${c.accent}14` : 'transparent',
              }}>
              <Text variant="label" color={d.isToday ? c.accentGlow : c.textMuted} style={{ width: 36 }}>{d.weekday}</Text>
              <Icon
                name={d.done ? 'checkmark-circle' : d.dayName ? 'barbell-outline' : d.past ? 'remove-outline' : 'moon-outline'}
                size={16}
                color={d.done ? c.success : d.dayName && !d.past ? c.textDim : c.textMuted}
              />
              <Text variant="callout" style={{ flex: 1 }} color={d.dayName && !d.past ? c.text : d.done ? c.textDim : c.textMuted}>
                {d.dayName ?? (d.past ? '—' : 'Rest')}
              </Text>
              {d.isToday ? <Pill label="Today" color={c.accentGlow} /> : null}
            </View>
          ))}
        </Card>
      </Appear>

      {/* Quick sessions */}
      <Appear index={4} style={{ gap: spacing[3] }}>
        <SectionHeader title="Quick sessions" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
          {quickSessions.map((q) => {
            const t = workoutTypes.find((x) => x.id === q.typeId);
            const minutes = Math.round(((q.work + q.rest) * q.moves.length * q.rounds) / 60);
            return (
              <PressableScale key={q.id} haptic="tap" onPress={() => router.push(`/workout/quick/${q.id}`)} accessibilityRole="button" accessibilityLabel={q.name}
                style={{ width: '47.8%', backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing[4], gap: spacing[2] }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${t?.color ?? c.accent}22` }}>
                  <Icon name={(t?.icon ?? 'flash') as never} size={18} color={t?.color ?? c.accent} />
                </View>
                <Text variant="heading">{`${minutes} min`}</Text>
                <Text variant="caption" dim numberOfLines={1}>{q.name.replace(/^\d+-Minute /, '')}</Text>
              </PressableScale>
            );
          })}
        </View>
      </Appear>

      {/* History */}
      {history.length ? (
        <Appear index={5} style={{ gap: spacing[3] }}>
          <SectionHeader title="Recent" />
          <Card padded={false}>
            {history.slice(0, 4).map((h, i) => (
              <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                <Icon name={h.kind === 'quick' ? 'flash-outline' : 'barbell-outline'} size={18} />
                <View style={{ flex: 1 }}>
                  <Text variant="callout">{h.name}</Text>
                  <Text variant="caption" muted>{`${h.date} · ${h.minutes} min${h.workingSets ? ` · ${h.workingSets} sets` : ''}${h.prs.length ? ` · ${h.prs.length} PR` : ''}`}</Text>
                </View>
                <Text variant="callout" color={c.accentGlow}>{`+${h.xp} XP`}</Text>
              </View>
            ))}
          </Card>
        </Appear>
      ) : null}

      <Appear index={6}>
        <Button variant="secondary" icon="library-outline" label="Exercise library" onPress={() => router.push('/exercises')} />
      </Appear>
    </Screen>
  );
}

function Meta({ icon, text }: { icon: React.ComponentProps<typeof Icon>['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={15} />
      <Text variant="caption" dim>{text}</Text>
    </View>
  );
}
