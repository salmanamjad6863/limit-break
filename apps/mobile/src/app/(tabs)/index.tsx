import { heroes, workoutTypes } from '@lb/content';
import { levelProgress, powerLevel } from '@lb/engine';
import { dataColors } from '@lb/tokens';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { activeSlots, questRatio as questRatioOf } from '@lb/contracts';
import { NextAchievementCard, useAchievements } from '@/features/achievements';
import { useMyLook } from '@/features/avatar';
import { restDayContent } from '@/features/depth';
import { BossTeaser, HunterCard, StatsChart, TodayList, UpNextCard, type TodayItem } from '@/features/home/HomeCards';
import { useGameDate, useNutritionDay } from '@/features/nutrition';
import { useBoss, useQuests } from '@/features/quests';
import { useLocalHunter, useMe, useProgression } from '@/features/progression';
import { useSession } from '@/features/session';
import {
  exerciseName, StaleSessionCard, useStaleSession, useToday, useTraining, useTrainingProfile, useUpdateTraining, useWorkoutHistory, useWorkoutSession,
} from '@/features/training';
import { estimateKcal, targetMuscles } from '@/features/training/TrainCards';
import { bestSide, MuscleMap } from '@/features/visuals';
import { useAnalyticsConsent } from '@/lib/analytics';
import { env } from '@/lib/env';
import { storage } from '@/lib/storage';
import { greeting, useQuestDeadline } from '@/lib/time';
import { useTheme } from '@/theme';
import { Appear, Button, Card, Icon, PressableScale, Screen, SectionHeader, SettingsGear, Text } from '@/ui';

/** Home is a dashboard (docs/plans/HOME_QUESTS_REDESIGN.md §3): what's next, today at a glance, who you are. */
export default function HomeScreen() {
  const { c, spacing, radius } = useTheme();
  const look = useMyLook();
  const myTitle = useAchievements().data?.equippedTitle ?? null;
  const sessionStatus = useSession((s) => s.status);
  const resetLocal = useLocalHunter((s) => s.reset);
  const { data: me, isLoading, error } = useMe();
  const { data: food } = useNutritionDay(useGameDate());
  const { data: prog } = useProgression();
  const deadline = useQuestDeadline();
  const { data: quests } = useQuests();
  const { data: boss } = useBoss();
  const today = useToday();
  const profile = useTrainingProfile();
  const history = useTraining((s) => s.history);
  const activeWorkout = useWorkoutSession((s) => s.active);
  const stale = useStaleSession();

  if (isLoading || sessionStatus === 'booting') return <Screen><Text dim>Loading…</Text></Screen>;
  if (error || !me) return <Screen><Text color={c.danger}>{"Couldn't reach the server. Your data is safe offline."}</Text></Screen>;

  const state = me.state;
  const hero = heroes.find((h) => h.id === me.heroId) ?? heroes[0]!;
  const lp = levelProgress(state?.xp ?? 0);
  const rank = state?.rank ?? 'E';
  const raw = prog?.stats as Record<'STR' | 'AGI' | 'END' | 'VIT' | 'SPI', number> | undefined;
  // Display ×10 (SYSTEMS §4.3); fall back to the server's stored state while progression loads
  const stats = raw
    ? { STR: Math.round(raw.STR * 10), AGI: Math.round(raw.AGI * 10), END: Math.round(raw.END * 10), VIT: Math.round(raw.VIT * 10), SPI: Math.round(raw.SPI * 10) }
    : (state?.stats ?? { STR: 100, AGI: 100, END: 100, VIT: 100, SPI: 100 });
  const power = powerLevel({ STR: stats.STR / 10, AGI: stats.AGI / 10, END: stats.END / 10, VIT: stats.VIT / 10, SPI: stats.SPI / 10 }, lp.level);
  const trialHint = (() => {
    const t = prog?.trial;
    if (!t?.target) return null;
    if (t.eligible) return { rank: t.target, text: `${t.target}-Rank Trial unlocked. Tap to attempt.` };
    if (t.reason === 'level') return { rank: t.target, text: `${t.target}-Rank Trial unlocks at level ${t.levelRequired}` };
    return null;
  })();

  const daily = quests?.daily;
  const slots = daily ? activeSlots(daily) : [];
  const slotsDone = daily ? slots.filter((s, i) => (daily.progress[String(i)] ?? 0) >= s.target).length : 0;
  const questDone = daily?.status === 'COMPLETED';
  const penaltyActive = !!quests?.penalty && quests.penalty.status !== 'COMPLETED';
  const streak = quests?.streak.current ?? state?.streak ?? 0;
  const type = workoutTypes.find((t) => t.id === today.program.typeId);
  const programDone = history.some((h) => h.date === today.todayIso && h.kind === 'program');
  const anyWorkout = history.some((h) => h.date === today.todayIso);
  const w = today.workout;
  const muscles = targetMuscles(w.exercises.map((e) => e.exerciseId));
  const protein = { eaten: Math.round(food?.totals.protein ?? 0), target: food?.plan.proteinG ?? 0 };
  const rest = restDayContent(today.todayIso);

  // One "Up next", by priority: unfinished workout → penalty → today's workout → daily quest → all clear
  const upNext = stale ? (
    <StaleSessionCard a={stale.active} finishAt={stale.finishAt} canSave={stale.canSave} />
  ) : activeWorkout ? (
    <UpNextCard color={c.accent} eyebrow="In progress" title={activeWorkout.name} icon="barbell"
      body="Your workout is saved. Pick up right where you left off."
      action={{ label: 'Resume workout', icon: 'play', onPress: () => router.push('/workout/session') }} />
  ) : penaltyActive ? (
    <UpNextCard color={c.danger} eyebrow="Penalty Zone" title="Save your streak" icon="warning"
      body="You missed yesterday's quest. Survive 5 minutes and finish today's quest to keep your streak."
      action={{ label: 'Open the Penalty Zone', icon: 'flash', onPress: () => router.push('/quests') }} />
  ) : (today.isTrainingDay || today.schedule.canTrainInstead) && !programDone ? (
    <UpNextCard color={type?.color ?? c.accent} eyebrow={today.isTrainingDay ? `Today · ${today.program.name}` : 'Make-up session'} title={w.name}
      meta={[
        { icon: 'time-outline', text: `${w.estimatedMinutes} min` },
        { icon: 'list-outline', text: `${w.exercises.length} exercises` },
        { icon: 'flame-outline', text: `~${estimateKcal(w.estimatedMinutes, profile.weightKg, today.mode.intensity)} kcal` },
      ]}
      art={<MuscleMap primary={muscles} side={bestSide(muscles)} width={56} showLabels={false} />}
      action={{ label: 'Start workout', icon: 'play', onPress: () => router.push('/workout/preview') }}
      secondary={{ label: 'Change today’s workout', onPress: () => router.push('/train') }} />
  ) : daily && !questDone && !quests?.streak.sickToday ? (
    <UpNextCard color={c.danger} eyebrow={`Daily Quest · ${deadline}`} title={daily.progress.option === 1 ? 'Rest Ritual' : 'Daily Quest'} icon="flag"
      body={slots.map((s, i) => `${exerciseName(s.exerciseId)} ${Math.min(daily.progress[String(i)] ?? 0, s.target)}/${s.target}`).join(' · ')}
      action={{ label: 'Follow along', icon: 'play-circle', onPress: () => router.push(`/workout/quest/${daily.id}`) }}
      secondary={{ label: 'Log it in Quests', onPress: () => router.push('/quests') }} />
  ) : (
    <UpNextCard color={c.success} eyebrow={programDone || anyWorkout ? 'All clear' : 'Rest day'} title={programDone || anyWorkout ? 'Great work today.' : rest.title} icon="leaf"
      body={programDone || anyWorkout ? `Muscles grow while you rest. Next up: ${w.name}.` : rest.body}
      action={{ label: 'Mobility · 10 min', icon: 'leaf-outline', onPress: () => router.push('/workout/quick/mobility-10') }} />
  );

  const items: TodayItem[] = [
    {
      key: 'workout', icon: 'barbell', color: dataColors.workout, title: 'Workout', done: anyWorkout,
      ratio: anyWorkout ? 1 : activeWorkout ? Object.values(activeWorkout.logs).reduce((n, l) => n + l.length, 0) / Math.max(1, activeWorkout.exercises.reduce((n, x) => n + x.sets.length, 0)) : 0,
      detail: anyWorkout ? (history.find((h) => h.date === today.todayIso)?.name ?? 'Done')
        : activeWorkout ? `In progress · ${activeWorkout.name}`
        : today.isTrainingDay ? `${w.name} · ${w.estimatedMinutes} min`
        : today.schedule.canTrainInstead ? `Rest day · make-up available: ${w.name}` : 'Rest day · mobility optional',
      onPress: () => router.push('/train'),
    },
    {
      key: 'quest', icon: 'flag', color: dataColors.quest, title: 'Daily Quest', ratio: daily ? questRatioOf(daily) : 0, done: !!questDone,
      detail: questDone ? 'Cleared' : quests?.streak.sickToday ? 'Streak frozen today' : `${slotsDone} of ${slots.length} moves · ${deadline}`,
      onPress: () => router.push('/quests'),
    },
    {
      key: 'protein', icon: 'water', color: dataColors.protein, title: 'Protein', ratio: protein.target ? protein.eaten / protein.target : 0,
      done: protein.target > 0 && protein.eaten >= protein.target,
      detail: protein.target ? `${protein.eaten} / ${protein.target} g` : 'Set up your nutrition plan',
      onPress: () => router.push('/nutrition'),
    },
  ];

  return (
    <Screen accent={hero.accent}>
      {/* Header */}
      <Appear index={0} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text variant="callout" dim>{greeting()}</Text>
          <Text variant="title" numberOfLines={1}>{me.hunterName ?? 'Hunter'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <PressableScale haptic="tap" onPress={() => router.push('/quests')} accessibilityRole="button"
            accessibilityLabel={streak ? `${streak} day streak` : 'Start a streak'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32, borderRadius: radius.pill,
              backgroundColor: penaltyActive ? `${c.danger}22` : streak ? `${c.warning}22` : c.surface, borderWidth: 1, borderColor: penaltyActive ? `${c.danger}55` : streak ? `${c.warning}44` : c.border }}>
            <Icon name="flame" size={14} color={penaltyActive ? c.danger : streak ? c.warning : c.textMuted} />
            <Text variant="caption" color={penaltyActive ? c.danger : streak ? c.text : c.textDim} style={{ fontFamily: 'Inter_600SemiBold' }}>
              {streak ? `${streak}` : 'Start a streak'}
            </Text>
          </PressableScale>
          <SettingsGear />
        </View>
      </Appear>

      <ConsentCard />
      <SaveProgressCard />
      <TrainingProfileCard />

      <Appear index={1}>{upNext}</Appear>

      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title="Your hunter" action="Profile" onAction={() => router.push('/profile')} />
        <HunterCard name={me.hunterName ?? hero.name} epithet={hero.epithet} accent={hero.accent} level={lp.level} power={power} rank={rank}
          xpInto={lp.intoLevel} xpNeeded={lp.needed} ratio={lp.ratio} trialHint={trialHint} onPress={() => router.push('/profile')}
          aura={look.aura} title={myTitle} />
      </Appear>

      <Appear index={3} style={{ gap: spacing[3] }}>
        <TodayList items={items} />
        <NextAchievementCard />
      </Appear>

      <Appear index={4} style={{ gap: spacing[3] }}>
        <SectionHeader title="True Stats" />
        <StatsChart stats={stats} />
      </Appear>

      {boss ? (
        <Appear index={5} style={{ gap: spacing[3] }}>
          <SectionHeader title="Weekly boss" action="Resets Monday" />
          <BossTeaser hpPct={boss.hpPct} won={boss.won} prophecy={boss.prophecy} onPress={() => router.push('/quests')} />
        </Appear>
      ) : null}

      {sessionStatus === 'demo' ? (
        <Appear index={6}>
          <Button variant="ghost" size="md" label="Replay onboarding (demo)" onPress={resetLocal} />
        </Appear>
      ) : null}
    </Screen>
  );
}

/** One-time, opt-in analytics question (EU ePrivacy: analytics are non-essential). Only shown when analytics exist in this build. */
function ConsentCard() {
  const { spacing } = useTheme();
  const consent = useAnalyticsConsent((s) => s.consent);
  const set = useAnalyticsConsent((s) => s.set);
  if (!env.posthogKey || consent !== 'unknown') return null;
  return (
    <Card>
      <Text variant="headline">Help improve LIMITBREAK?</Text>
      <Text variant="callout" dim>Share anonymous usage stats, like which screens get used. Never your name, email, weight or food. Change it any time in your profile.</Text>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <View style={{ flex: 1 }}><Button size="md" label="Allow" onPress={() => set('granted')} /></View>
        <View style={{ flex: 1 }}><Button variant="secondary" size="md" label="No thanks" onPress={() => set('denied')} /></View>
      </View>
    </Card>
  );
}

const SAVE_DISMISSED = 'lb.savePrompt.dismissedAt';
const SAVE_SNOOZE_MS = 3 * 24 * 60 * 60_000;

/** "Save your progress, Hunter" (PLAN.md §7): guests are asked after their first workout; "Later" snoozes 3 days. */
function SaveProgressCard() {
  const { c, spacing } = useTheme();
  const isGuest = useSession((s) => s.isGuest);
  const { workouts } = useWorkoutHistory();
  const [dismissedAt, setDismissedAt] = useState(() => storage.getNumber(SAVE_DISMISSED) ?? 0);
  // read the clock once per mount, not on every render
  const [openedAt] = useState(() => Date.now());
  if (!isGuest || workouts.length === 0 || openedAt - dismissedAt < SAVE_SNOOZE_MS) return null;
  return (
    <Card tint={c.accent}>
      <Text variant="label" color={c.accentGlow}>SYSTEM</Text>
      <Text variant="headline">Save your progress, Hunter</Text>
      <Text variant="callout" dim>You’re training as a guest. Add your email to keep your rank, XP and workouts if you lose or change your phone.</Text>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <View style={{ flex: 1 }}><Button size="md" label="Save progress" onPress={() => router.push('/sign-in?mode=save')} /></View>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" size="md" label="Later" onPress={() => { const now = Date.now(); storage.set(SAVE_DISMISSED, now); setDismissedAt(now); }} />
        </View>
      </View>
    </Card>
  );
}

/**
 * Profiles created before male/female became required (docs/plans/TRAIN_REDESIGN.md §4.2) choose once:
 * it sets starting weights and strength levels. Shown until answered.
 */
function TrainingProfileCard() {
  const { c, spacing } = useTheme();
  const profile = useTrainingProfile();
  const save = useUpdateTraining();
  const today = useToday();
  if (profile.sex !== 'unspecified') return null;
  const choose = (sex: 'male' | 'female') =>
    save.mutate({
      input: {
        experience: profile.experience, location: profile.location, equipment: profile.equipment, injuries: profile.injuries,
        sessionMinutes: profile.sessionMinutes as 15 | 30 | 45 | 60 | 75 | 90,
        weekdays: today.weekdays, workoutTime: profile.workoutTime ?? null, sex,
      },
      nextWorkout: today.workout.name,
    });
  return (
    <Card tint={c.accent}>
      <Text variant="label" color={c.accentGlow}>SYSTEM</Text>
      <Text variant="headline">Set your training profile</Text>
      <Text variant="callout" dim>Workouts now set your starting weights and strength levels from your profile. Every program stays open to everyone.</Text>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <View style={{ flex: 1 }}><Button size="md" label="Male" loading={save.isPending} onPress={() => choose('male')} /></View>
        <View style={{ flex: 1 }}><Button size="md" label="Female" loading={save.isPending} onPress={() => choose('female')} /></View>
      </View>
    </Card>
  );
}
