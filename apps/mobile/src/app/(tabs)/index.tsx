import { heroes, workoutTypes } from '@lb/content';
import { gameDate, levelProgress, powerLevel } from '@lb/engine';
import { dataColors, rankColor, statColors } from '@lb/tokens';
import { router } from 'expo-router';
import { View } from 'react-native';
import { activeSlots, questRatio as questRatioOf } from '@lb/contracts';
import { useGameDate, useNutritionDay } from '@/features/nutrition';
import { useQuestActions, useQuests } from '@/features/quests';
import { SlotRow } from '@/features/quests/SlotRow';
import { useLocalHunter, useMe, useProgression } from '@/features/progression';
import { useSession } from '@/features/session';
import { useToday, useTraining, useTrainingProfile, useWorkoutSession } from '@/features/training';
import { useAnalyticsConsent } from '@/lib/analytics';
import { env } from '@/lib/env';
import { greeting, useQuestDeadline } from '@/lib/time';
import { useTheme } from '@/theme';
import { Appear, Bar, Button, Card, CountUp, Icon, Pill, PressableScale, Screen, SectionHeader, StatRow, SystemWindow, Text } from '@/ui';
import { HeroEmblem, RankBadge, Ring } from '@/ui/fx';

const STAT_KEYS = ['STR', 'AGI', 'END', 'VIT', 'SPI'] as const;


export default function HomeScreen() {
  const { c, spacing } = useTheme();
  const sessionStatus = useSession((s) => s.status);
  const resetLocal = useLocalHunter((s) => s.reset);
  const { data: me, isLoading, error } = useMe();
  const { data: food } = useNutritionDay(useGameDate());
  const protein = { eaten: Math.round(food?.totals.protein ?? 0), target: food?.plan.proteinG ?? 0 };
  const { data: prog } = useProgression();
  const deadline = useQuestDeadline();
  const { data: quests } = useQuests();
  const { progress: questProgress } = useQuestActions();
  const today = useToday();
  const profile = useTrainingProfile();
  const history = useTraining((s) => s.history);
  const activeWorkout = useWorkoutSession((s) => s.active);

  if (isLoading) return <Screen><Text dim>Loading…</Text></Screen>;
  if (error || !me) return <Screen><Text color={c.danger}>Couldn't reach the server. Your data is safe offline.</Text></Screen>;

  const state = me.state;
  const hero = heroes.find((h) => h.id === me.heroId) ?? heroes[0]!;
  const xp = state?.xp ?? 0;
  const lp = levelProgress(xp);
  const rank = state?.rank ?? 'E';
  const raw = prog?.stats as Record<'STR' | 'AGI' | 'END' | 'VIT' | 'SPI', number> | undefined;
  // Display ×10 (SYSTEMS §4.3); fall back to the server's stored state while progression loads
  const stats = raw
    ? { STR: Math.round(raw.STR * 10), AGI: Math.round(raw.AGI * 10), END: Math.round(raw.END * 10), VIT: Math.round(raw.VIT * 10), SPI: Math.round(raw.SPI * 10) }
    : (state?.stats ?? { STR: 100, AGI: 100, END: 100, VIT: 100, SPI: 100 });
  const power = powerLevel(
    { STR: stats.STR / 10, AGI: stats.AGI / 10, END: stats.END / 10, VIT: stats.VIT / 10, SPI: stats.SPI / 10 },
    lp.level,
  );
  const trialHint = (() => {
    const t = prog?.trial;
    if (!t?.target) return null;
    if (t.eligible) return { target: t.target, text: `${t.target}-Rank Trial unlocked. Tap to attempt.` };
    if (t.reason === 'level') return { target: t.target, text: `${t.target}-Rank Trial unlocks at level ${t.levelRequired}` };
    return null;
  })();
  const daily = quests?.daily;
  const questRatio = daily ? questRatioOf(daily) : 0;
  const questDone = daily?.status === 'COMPLETED';
  const penaltyActive = !!quests?.penalty && quests.penalty.status !== 'COMPLETED';
  const type = workoutTypes.find((t) => t.id === today.program.typeId)!;
  const todayIso = gameDate(new Date(), profile.timezone || 'UTC');
  const workoutsToday = history.filter((h) => h.date === todayIso).length;
  const programDoneToday = history.some((h) => h.date === todayIso && h.kind === 'program');
  const state_: 'active' | 'done' | 'train' | 'rest' = activeWorkout ? 'active' : programDoneToday ? 'done' : today.isTrainingDay ? 'train' : 'rest';

  return (
    <Screen accent={hero.accent}>
      {/* Header */}
      <Appear index={0} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text variant="callout" dim>{greeting()}</Text>
          <Text variant="title">{me.hunterName ?? 'Hunter'}</Text>
        </View>
        <Pill icon="flame" label={`${quests?.streak.current ?? state?.streak ?? 0} day streak`} color={penaltyActive ? c.danger : c.warning} />
      </Appear>

      {/* Hunter card */}
      <ConsentCard />
      <Appear index={1}>
        <PressableScale haptic="tap" scaleTo={0.98} onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Open hunter profile">
        <Card tint={hero.accent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <HeroEmblem size={104} color={hero.accent} initial={(me.hunterName ?? hero.name).charAt(0).toUpperCase()} />
            <View style={{ flex: 1, gap: spacing[1] }}>
              <Text variant="label" color={hero.accent}>{hero.epithet}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] }}>
                <Text variant="caption" dim>Level</Text>
                <CountUp variant="stat" value={lp.level} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="flash" size={13} color={c.accentGlow} />
                <CountUp variant="callout" value={power} duration={1200} color={c.text} />
                <Text variant="caption" muted>power</Text>
              </View>
            </View>
            <View style={{ alignItems: 'center' }}>
              <RankBadge rank={rank} size={64} />
              <Text variant="micro" color={rankColor[rank]}>{`${rank}-Rank`}</Text>
            </View>
          </View>
          <Bar ratio={lp.ratio} height={6} color={c.accent} delayMs={250} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" muted>{`${lp.intoLevel.toLocaleString()} / ${lp.needed.toLocaleString()} XP`}</Text>
            <Text variant="caption" dim>{`${(lp.needed - lp.intoLevel).toLocaleString()} XP to level ${lp.level + 1}`}</Text>
          </View>
          {trialHint ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="shield-checkmark" size={14} color={rankColor[trialHint.target]} />
              <Text variant="caption" color={rankColor[trialHint.target]}>{trialHint.text}</Text>
            </View>
          ) : null}
        </Card>
        </PressableScale>
      </Appear>

      {/* Today rings */}
      <Appear index={2}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {[
              { label: 'Workout', value: `${Math.min(workoutsToday, 1)} / 1`, ratio: Math.min(1, workoutsToday), color: dataColors.workout, icon: 'barbell' as const },
              { label: 'Daily Quest', value: `${Math.round(questRatio * 100)}%`, ratio: questRatio, color: dataColors.quest, icon: 'flag' as const },
              { label: 'Protein', value: `${protein.eaten}g`, ratio: protein.target ? protein.eaten / protein.target : 0, color: dataColors.protein, icon: 'water' as const },
            ].map((r, i) => (
              <View key={r.label} style={{ alignItems: 'center', gap: spacing[2] }}>
                <Ring ratio={r.ratio} size={76} stroke={8} color={r.color} delayMs={200 + i * 120}>
                  <Icon name={r.icon} size={20} color={r.color} />
                </Ring>
                <View style={{ alignItems: 'center' }}>
                  <Text variant="heading">{r.value}</Text>
                  <Text variant="caption" muted>{r.label}</Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      </Appear>

      {/* Today's workout */}
      <Appear index={3} style={{ gap: spacing[3] }}>
        <SectionHeader
          title={{ active: 'In progress', done: 'Done today', train: "Today's workout", rest: 'Rest day' }[state_]}
          action="See plan"
          onAction={() => router.push('/train')}
        />
        <Card tint={type.color}>
          <Pill icon={type.icon as never} label={`${today.program.name} · ${type.name}`} color={type.color} />
          <Text variant="headline">
            {{ active: activeWorkout?.name ?? '', done: 'Workout complete. Great work.', train: today.workout.name, rest: 'Recovery day' }[state_]}
          </Text>
          {state_ === 'active' || state_ === 'train' ? (
            <View style={{ flexDirection: 'row', gap: spacing[4] }}>
              <Meta icon="time-outline" text={`~${today.workout.estimatedMinutes} min`} />
              <Meta icon="list-outline" text={`${today.workout.exercises.length} exercises`} />
              <Meta icon="trending-up-outline" text="Coached loads" />
            </View>
          ) : (
            <Text variant="callout" dim>
              {state_ === 'done' ? `Next up: ${today.workout.name}. A short mobility flow helps recovery.` : 'Take a 10-minute mobility session to keep your streak.'}
            </Text>
          )}
          <Button
            label={{ active: 'Resume workout', done: 'Mobility · 10 min', train: 'Start workout', rest: 'Mobility · 10 min' }[state_]}
            icon={state_ === 'active' || state_ === 'train' ? 'play' : 'leaf-outline'}
            variant={state_ === 'done' || state_ === 'rest' ? 'secondary' : 'primary'}
            onPress={() =>
              router.push(state_ === 'active' ? '/workout/session' : state_ === 'train' ? '/workout/preview' : '/workout/quick/mobility-10')
            }
          />
        </Card>
      </Appear>

      {/* Daily Quest — the System's voice */}
      {daily ? (
        <Appear index={4}>
          <SystemWindow
            title={penaltyActive ? 'Penalty Zone' : daily.progress.option === 1 ? 'Rest Ritual' : 'Daily Quest'}
            accent={c.danger}
            typeDelayMs={400}
            right={<Pill icon={questDone ? 'checkmark-circle' : 'time-outline'} label={questDone ? 'Cleared' : deadline} color={questDone ? c.success : c.textDim} />}>
            {penaltyActive ? (
              <Text variant="callout" color={c.danger}>You missed a day. Clear the penalty in Quests and finish today’s quest to save your streak.</Text>
            ) : null}
            {activeSlots(daily).map((s, i) => (
              <SlotRow key={`${s.exerciseId}-${i}`} slot={s} done={daily.progress[String(i)] ?? 0} color={c.danger} locked={questDone || quests?.streak.sickToday}
                onSet={(v) => questProgress.mutate({ quest: daily, progress: { [String(i)]: v } })} />
            ))}
            <Button variant={penaltyActive ? 'primary' : 'secondary'} size="md" label={penaltyActive ? 'Open Penalty Zone' : 'All quests'} onPress={() => router.push('/quests')} />
          </SystemWindow>
        </Appear>
      ) : null}

      {/* True Stats */}
      <Appear index={5} style={{ gap: spacing[3] }}>
        <SectionHeader title="True Stats" />
        <Card>
          {STAT_KEYS.map((k, i) => (
            <StatRow key={k} label={k} value={stats[k]} color={statColors[k][0]} delayMs={300 + i * 80} />
          ))}
          <Text variant="caption" muted>Stats come from real tests and training data. They can't be bought.</Text>
        </Card>
      </Appear>

      {sessionStatus === 'demo' ? (
        <Appear index={6}>
          <Button variant="ghost" size="md" label="Replay onboarding (demo)" onPress={resetLocal} />
        </Appear>
      ) : null}
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
