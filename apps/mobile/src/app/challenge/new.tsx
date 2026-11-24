import type { CreateChallengeInput } from '@lb/contracts';
import {
  addDays, CHALLENGE_LENGTHS, CHALLENGE_LIMITS, challengeProblems, defaultGraceDays, gameDate, taskTarget, weekdayOf, type ChallengeTask,
} from '@lb/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { CHALLENGE_PRESETS, taskLabel, useChallengeActions, useChallengeDraft, useChallenges } from '@/features/challenges';
import { exerciseById, exerciseName, newId, useTrainingProfile } from '@/features/training';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';
import { Segmented, Stepper, TextField } from '@/ui/form';

/** Build a habit challenge: length, grace days, start, and the daily tasks (exercises with a ramp, or habits). */
export default function NewChallenge() {
  const { c, spacing, radius, type } = useTheme();
  const { preset } = useLocalSearchParams<{ preset?: string }>();
  const profile = useTrainingProfile();
  const today = gameDate(new Date(), profile.timezone || 'UTC');
  const draft = useChallengeDraft((s) => s.draft);
  const begin = useChallengeDraft((s) => s.begin);
  const update = useChallengeDraft((s) => s.update);
  const clear = useChallengeDraft((s) => s.clear);
  const actions = useChallengeActions();
  const active = useChallenges().filter((x) => x.status === 'ACTIVE').length;

  const fromPreset = (id: string | undefined, keepId?: string): CreateChallengeInput => {
    const p = CHALLENGE_PRESETS.find((x) => x.id === id);
    const days = p?.days ?? 30;
    return { id: keepId ?? newId(), name: p?.name ?? '', days, graceDays: defaultGraceDays(days), startDate: today, tasks: p?.tasks ?? [] };
  };
  useEffect(() => {
    begin(fromPreset(preset));
    // a fresh builder each time this screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!draft) return <Page header={<ScreenHeader title="New challenge" />}><Text dim>Loading…</Text></Page>;
  const d = draft;
  const problems = challengeProblems(d, (id) => exerciseById.has(id));
  const full = active >= CHALLENGE_LIMITS.maxActive;
  const setTask = (id: string, patch: Partial<ChallengeTask>) => update((x) => ({ ...x, tasks: x.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const setDays = (days: number) => update((x) => ({ ...x, days, graceDays: Math.min(x.graceDays, Math.max(0, days - 1), CHALLENGE_LIMITS.maxGrace) }));
  const nextMonday = addDays(today, ((8 - weekdayOf(today)) % 7) || 7);
  const startOpts = [{ value: today, label: 'Today' }, { value: addDays(today, 1), label: 'Tomorrow' }, { value: nextMonday, label: 'Next Monday' }];

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <PressableScale key={label} haptic="tap" onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? c.accent : c.border, backgroundColor: on ? `${c.accent}1F` : c.surfaceRaised }}>
      <Text variant="callout" color={on ? c.text : c.textDim}>{label}</Text>
    </PressableScale>
  );

  return (
    <Page
      header={<ScreenHeader title="New challenge" icon="close" onBack={() => { clear(); router.back(); }} />}
      footer={
        <View style={{ gap: spacing[2] }}>
          {full ? <Text variant="caption" color={c.warning}>{`You already have ${CHALLENGE_LIMITS.maxActive} challenges running. Finish or end one first.`}</Text>
            : problems.length ? <Text variant="caption" color={c.warning}>{problems[0]}</Text> : null}
          <Button label="Start challenge" icon="flag" disabled={full || !!problems.length}
            onPress={() => {
              const made = actions.create({ ...d, name: d.name.trim(), tasks: d.tasks.map((t) => ({ ...t, title: t.title.trim() })) });
              clear();
              router.replace(`/challenge/${made.id}`);
            }} />
        </View>
      }>
      <SectionHeader title="Start from" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[2] }}>
        {CHALLENGE_PRESETS.map((p) => (
          <PressableScale key={p.id} haptic="tap" onPress={() => begin(fromPreset(p.id, d.id))} accessibilityRole="button" accessibilityLabel={`Use ${p.name}`}
            style={{ width: 180, padding: spacing[3], gap: 4, borderRadius: radius.md, borderWidth: 1, borderColor: d.name === p.name ? c.accent : c.border, backgroundColor: c.surface }}>
            <Text variant="callout" style={{ fontFamily: 'Inter_600SemiBold' }}>{p.name}</Text>
            <Text variant="caption" muted numberOfLines={3}>{p.blurb}</Text>
          </PressableScale>
        ))}
      </ScrollView>

      <TextField label="Challenge name" value={d.name} onChangeText={(name) => update((x) => ({ ...x, name: name.slice(0, 40) }))} placeholder="e.g. 60-day push-ups" />

      <SectionHeader title="Length" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {CHALLENGE_LENGTHS.map((n) => chip(`${n} days`, d.days === n, () => setDays(n)))}
      </View>
      <Stepper label="Days" value={d.days} min={CHALLENGE_LIMITS.minDays} max={CHALLENGE_LIMITS.maxDays} onChange={setDays} />

      <SectionHeader title="Grace days" />
      <Stepper label="Misses covered" value={d.graceDays} min={0} max={Math.min(CHALLENGE_LIMITS.maxGrace, d.days - 1)} onChange={(graceDays) => update((x) => ({ ...x, graceDays }))} />
      <Text variant="caption" muted>
        A missed day never restarts the challenge. Grace days cover the first misses; after that, a miss just moves the finish one day later.
      </Text>

      <SectionHeader title="Start" />
      <Segmented options={startOpts} value={d.startDate} onChange={(startDate) => update((x) => ({ ...x, startDate }))} />

      <SectionHeader title="Every day" />
      {d.tasks.map((t) => (
        <Card key={t.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Icon name={t.kind === 'exercise' ? 'barbell-outline' : 'checkbox-outline'} size={18} color={c.accentGlow} />
            {t.kind === 'exercise' ? (
              <Text variant="headline" style={{ flex: 1 }}>{exerciseName(t.exerciseId ?? '')}</Text>
            ) : (
              <TextInput value={t.title} onChangeText={(title) => setTask(t.id, { title: title.slice(0, 60) })} placeholder="Habit, e.g. Drink 3 L of water"
                placeholderTextColor={c.textMuted} accessibilityLabel="Habit name" style={{ flex: 1, color: c.text, fontFamily: type.headline.font, fontSize: 17, paddingVertical: 4 }} />
            )}
            <PressableScale haptic="tap" accessibilityRole="button" accessibilityLabel="Remove task" onPress={() => update((x) => ({ ...x, tasks: x.tasks.filter((y) => y.id !== t.id) }))}>
              <Icon name="close-circle-outline" size={22} color={c.textMuted} />
            </PressableScale>
          </View>
          {t.kind === 'exercise' ? (
            <View style={{ gap: spacing[3] }}>
              <Segmented options={[{ value: 'reps', label: 'Reps' }, { value: 'sec', label: 'Seconds' }, { value: 'min', label: 'Minutes' }]} value={t.unit ?? 'reps'}
                onChange={(unit) => setTask(t.id, { unit })} />
              <Stepper label="Day 1 target" value={t.target ?? 10} min={1} max={10_000} step={t.unit === 'sec' ? 5 : 1} onChange={(target) => setTask(t.id, { target })} />
              <Stepper label="Then add" value={t.addPerStep ?? 0} min={0} max={100} step={t.unit === 'sec' ? 5 : 1} onChange={(addPerStep) => setTask(t.id, { addPerStep })}
                format={(v) => (v ? `+${v}` : 'Same')} />
              {t.addPerStep ? <Stepper label="Every" value={t.stepDays ?? 1} min={1} max={30} onChange={(stepDays) => setTask(t.id, { stepDays })} format={(v) => (v === 1 ? 'day' : `${v} days`)} /> : null}
              <Text variant="caption" muted>{`Day 1: ${taskLabel(t, 1)} → Day ${d.days}: ${taskTarget(t, d.days)}`}</Text>
            </View>
          ) : null}
        </Card>
      ))}
      {d.tasks.length < CHALLENGE_LIMITS.tasks ? (
        <View style={{ gap: spacing[2] }}>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <View style={{ flex: 1 }}><Button variant="secondary" size="md" icon="barbell-outline" label="Exercise" onPress={() => router.push('/challenge/pick')} /></View>
            <View style={{ flex: 1 }}><Button variant="secondary" size="md" icon="sparkles-outline" label="Habits" onPress={() => router.push('/challenge/habits')} /></View>
          </View>
        </View>
      ) : null}
      <Text variant="caption" muted>Tick your tasks each day on the Quests tab. A fully done day earns XP, and finishing earns a bonus.</Text>
    </Page>
  );
}
