import { FOCUS_CATEGORIES, focusedWorkouts, type FocusedWorkout } from '@lb/content';
import { gameDate } from '@lb/engine';
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import {
  buildFocused, programs, quickSessions, StaleSessionCard, usePersonalContext, useRoutines, useStaleSession, useToday, useTraining, useTrainingProfile, useWorkoutSession, workoutTypes,
} from '@/features/training';
import {
  CATEGORY_LABEL, estimateKcal, ExerciseRow, FilterChips, FocusedPoster, ModeBar, ProgramHero, ProgramPoster, SessionPoster, Shelf, targetMuscles, WeekStrip,
} from '@/features/training/TrainCards';
import { bestSide, MuscleMap } from '@/features/visuals';
import { useTheme } from '@/theme';
import { Appear, Button, Card, Icon, type IconName, PressableScale, Screen, SectionHeader, Text } from '@/ui';

export default function TrainScreen() {
  const { c, spacing } = useTheme();
  const profile = useTrainingProfile();
  const today = useToday();
  const history = useTraining((s) => s.history);
  const completed = useTraining((s) => s.completedSessions);
  const activeProgramId = useTraining((s) => s.activeProgramId);
  const setMode = useTraining((s) => s.setMode);
  const active = useWorkoutSession((s) => s.active);
  const stale = useStaleSession();
  const type = workoutTypes.find((t) => t.id === today.program.typeId);
  const w = today.workout;
  const todayIso = gameDate(new Date(), profile.timezone || 'UTC');
  const doneToday = history.some((h) => h.kind === 'program' && h.date === todayIso);
  const muscles = targetMuscles(w.exercises.map((e) => e.exerciseId));
  const kcal = estimateKcal(w.estimatedMinutes, profile.weightKg, today.mode.intensity);
  const showPlan = !active && (today.isTrainingDay ? !doneToday : today.schedule.canTrainInstead);
  const currentId = activeProgramId ?? today.program.id;
  const [category, setCategory] = useState<'all' | FocusedWorkout['category']>('all');
  const ctx = usePersonalContext();
  const routines = useRoutines();
  // posters show the session this hunter will actually get (level, kit, age)
  const focusedPlans = useMemo(() => new Map(focusedWorkouts.map((f) => [f.id, buildFocused(f, ctx)])), [ctx]);
  // your level and setting first; everything stays available
  const home = profile.location === 'HOME';
  const focused = focusedWorkouts
    .filter((f) => category === 'all' || f.category === category)
    .map((f) => ({ f, score: (f.levels.includes(profile.experience) ? 2 : 0) + ((f.location === 'HOME') === home ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.f);

  return (
    <Screen title="Train" subtitle="Beginner to Pro, shaped to you every day." accent={type?.color ?? c.danger}>
      <Appear index={1}>
        <ProgramHero today={today} completed={completed} level={profile.experience} />
      </Appear>

      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title="This week" action="Schedule" onAction={() => router.push('/training-settings')} />
        <WeekStrip today={today} />
      </Appear>

      {/* Today */}
      <Appear index={3} style={{ gap: spacing[3] }}>
        <SectionHeader title={stale ? 'Before you train' : active ? 'In progress' : doneToday ? 'Done today' : today.isTrainingDay ? "Today's workout" : 'Rest day'} />

        {stale ? (
          <StaleSessionCard a={stale.active} finishAt={stale.finishAt} canSave={stale.canSave} />
        ) : active ? (
          <Card tint={c.accent}>
            <Text variant="headline">{active.name}</Text>
            <Text variant="callout" dim>Your workout is saved. Pick up right where you left off.</Text>
            <Button label="Resume workout" icon="play" onPress={() => router.push('/workout/session')} />
          </Card>
        ) : doneToday ? (
          <Card tint={c.success}>
            <Text variant="headline">Great work today.</Text>
            <Text variant="callout" dim>Muscles grow while you rest. A short mobility flow helps you recover.</Text>
            <Button variant="secondary" icon="leaf-outline" label="10-minute mobility" onPress={() => router.push('/workout/quick/mobility-10')} />
          </Card>
        ) : !today.isTrainingDay ? (
          <Card tint={c.mana}>
            <Text variant="headline">Recovery is part of the plan.</Text>
            <Text variant="callout" dim>
              {today.schedule.canTrainInstead
                ? `You have ${today.schedule.missedThisWeek === 1 ? 'a session' : `${today.schedule.missedThisWeek} sessions`} to make up this week. Train today if you feel fresh; the plan just continues.`
                : `Next up: ${w.name}. Walks and mobility speed up recovery.`}
            </Text>
            <Button variant="secondary" icon="leaf-outline" label="10-minute mobility" onPress={() => router.push('/workout/quick/mobility-10')} />
          </Card>
        ) : null}

        {showPlan ? (
          <Card padded={false}>
            {/* header: title, stats, target muscles */}
            <View style={{ flexDirection: 'row', gap: spacing[3], padding: spacing[4], paddingBottom: spacing[3] }}>
              <View style={{ flex: 1, gap: spacing[2] }}>
                {!today.isTrainingDay ? <Text variant="label" color={c.mana}>Make-up session</Text> : null}
                <Text variant="title" numberOfLines={2}>{w.name}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing[3], rowGap: 4 }}>
                  <Meta icon="time-outline" text={`${w.estimatedMinutes} min`} />
                  <Meta icon="list-outline" text={`${w.exercises.length} exercises`} />
                  <Meta icon="flame-outline" text={`~${kcal} kcal`} />
                </View>
              </View>
              <MuscleMap primary={muscles} side={bestSide(muscles)} width={60} showLabels={false} />
            </View>

            {/* change on the spot */}
            <View style={{ marginHorizontal: spacing[4], padding: spacing[3], borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: c.border }}>
              <ModeBar mode={today.mode} onChange={(m) => setMode(todayIso, m)} />
            </View>
            {w.unfilled.length ? (
              <Text variant="caption" color={c.warning} style={{ paddingHorizontal: spacing[4], paddingTop: spacing[2] }}>
                {`${w.unfilled.length} slot${w.unfilled.length === 1 ? '' : 's'} skipped: no exercise fits your equipment here.`}
              </Text>
            ) : null}

            <View style={{ paddingHorizontal: spacing[4], paddingTop: spacing[2] }}>
              {w.exercises.map((e, i) => (
                <ExerciseRow key={`${e.slotIndex}-${e.exerciseId}`} e={e} index={i} last={i === w.exercises.length - 1} />
              ))}
            </View>

            <View style={{ padding: spacing[4], paddingTop: spacing[3] }}>
              <Button label="Start workout" icon="play" onPress={() => router.push('/workout/preview')} />
            </View>
          </Card>
        ) : null}
      </Appear>

      {/* Focused workouts */}
      <Appear index={4} style={{ gap: spacing[3] }}>
        <SectionHeader title="Focused workouts" />
        <FilterChips options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
        <Shelf>
          {focused.map((f) => (
            <FocusedPoster key={f.id} f={f} exercises={focusedPlans.get(f.id)?.exercises.length ?? f.slots.length} minutes={focusedPlans.get(f.id)?.estimatedMinutes ?? f.minutes} />
          ))}
          {quickSessions.filter((q) => category === 'all' || QUICK_CATEGORY[q.id] === category).map((q) => <SessionPoster key={q.id} q={q} />)}
        </Shelf>
      </Appear>

      {/* Programs */}
      <Appear index={5} style={{ gap: spacing[3] }}>
        <SectionHeader title="Programs" action="See all" onAction={() => router.push('/programs')} />
        <PressableScale haptic="tap" onPress={() => router.push('/routines')} accessibilityRole="button" accessibilityLabel="My routines: build your own weekly workouts"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: 16, borderWidth: 1, borderColor: `${c.accent}55`, backgroundColor: `${c.accent}14` }}>
          <Icon name="construct-outline" size={22} color={c.accentGlow} />
          <View style={{ flex: 1 }}>
            <Text variant="callout" style={{ fontFamily: 'Inter_600SemiBold' }}>My routines</Text>
            <Text variant="caption" muted>
              {routines.length ? `${routines.length} routine${routines.length === 1 ? '' : 's'} · your exercises, sets and days` : 'Build your own week: exercises, sets, reps and days'}
            </Text>
          </View>
          <Icon name="chevron-forward" size={16} color={c.textMuted} />
        </PressableScale>
        <Shelf>
          {[...programs].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId)).map((p) => (
            <ProgramPoster key={p.id} p={p} active={p.id === currentId} />
          ))}
        </Shelf>
      </Appear>

      {/* Your training */}
      <Appear index={6} style={{ gap: spacing[3] }}>
        <SectionHeader title="Your training" />
        {history.length ? (
          <Card padded={false}>
            {history.slice(0, 3).map((h, i) => (
              <PressableScale key={h.id} haptic="tap" onPress={() => router.push(`/history/${h.id}`)} accessibilityRole="button" accessibilityLabel={h.name}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                  <Icon name={h.kind === 'manual' ? 'create-outline' : h.kind === 'quick' ? 'flash-outline' : 'barbell-outline'} size={18} />
                  <View style={{ flex: 1 }}>
                    <Text variant="callout">{h.name}</Text>
                    <Text variant="caption" muted>{`${h.date} · ${h.minutes} min${h.workingSets ? ` · ${h.workingSets} ${h.workingSets === 1 ? 'set' : 'sets'}` : ''}${h.prs.length ? ` · ${h.prs.length} PR` : ''}`}</Text>
                  </View>
                  <Text variant="callout" color={c.accentGlow}>{`+${h.xp} XP`}</Text>
                </View>
              </PressableScale>
            ))}
          </Card>
        ) : null}
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <LinkTile icon="calendar-outline" label="History" sub={history.length ? 'All workouts' : 'Log a workout'} onPress={() => router.push(history.length ? '/history' : '/history/log')} />
          <LinkTile icon="library-outline" label="Exercises" sub="Library & form" onPress={() => router.push('/exercises')} />
          <LinkTile icon="options-outline" label="Settings" sub="Days, level, kit" onPress={() => router.push('/training-settings')} />
        </View>
      </Appear>
    </Screen>
  );
}

const CATEGORY_OPTIONS = [{ value: 'all' as const, label: 'All' }, ...FOCUS_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))];
/** interval sessions slot into the same shelf */
const QUICK_CATEGORY: Record<string, FocusedWorkout['category']> = { 'express-7': 'hiit', 'hiit-15': 'hiit', 'mobility-10': 'mobility', 'core-12': 'abs' };

function Meta({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={14} />
      <Text variant="caption" dim>{text}</Text>
    </View>
  );
}

function LinkTile({ icon, label, sub, onPress }: { icon: IconName; label: string; sub: string; onPress: () => void }) {
  const { c, radius, spacing } = useTheme();
  return (
    <PressableScale haptic="tap" onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ flex: 1, padding: spacing[3], gap: 6, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <Icon name={icon} size={20} color={c.accentGlow} />
      <Text variant="callout" style={{ fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
      <Text variant="micro" muted numberOfLines={1}>{sub}</Text>
    </PressableScale>
  );
}
