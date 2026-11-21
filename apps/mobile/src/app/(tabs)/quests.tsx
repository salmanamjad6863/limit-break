import { sideQuests } from '@lb/content';
import { activeSlots, questRatio, type QuestDto } from '@lb/contracts';
import { STREAK } from '@lb/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useBoss, useQuestActions, useQuests } from '@/features/quests';
import { BossCard, SideTile, StreakHero, TileGrid } from '@/features/quests/QuestCards';
import { SlotRow } from '@/features/quests/SlotRow';
import { exerciseName, useTraining } from '@/features/training';
import { useQuestDeadline } from '@/lib/time';
import { useTheme } from '@/theme';
import { Appear, Bar, Button, Icon, Pill, PressableScale, Screen, SectionHeader, SystemWindow, Text } from '@/ui';

/** Quests (docs/plans/HOME_QUESTS_REDESIGN.md §4): streak, today's quest, side quests, weekly boss. */
export default function QuestsScreen() {
  const { c, spacing, radius } = useTheme();
  const { data } = useQuests();
  const { progress, chooseSides, setSick, claimBoss } = useQuestActions();
  const { data: boss } = useBoss();
  const deadline = useQuestDeadline();
  const history = useTraining((s) => s.history);

  if (!data) return <Screen title="Quests"><Text dim>Loading…</Text></Screen>;
  const { daily, penalty, streak } = data;
  const dailyDone = daily.status === 'COMPLETED';
  const ritual = daily.progress.option === 1;
  const penaltyActive = !!penalty && penalty.status !== 'COMPLETED';
  const nextMilestone = STREAK.milestones.find((m) => m > streak.current);
  const slots = activeSlots(daily);
  const slotsDone = slots.filter((s, i) => (daily.progress[String(i)] ?? 0) >= s.target).length;

  const set = (q: QuestDto, i: number, v: number) => progress.mutate({ quest: q, progress: { [String(i)]: v } });

  return (
    <Screen title="Quests" subtitle="Small daily wins that compound." accent={penaltyActive ? c.danger : '#FF9F43'}>
      <Appear index={1}>
        <StreakHero streak={streak} date={data.date} clearedToday={dailyDone} nextMilestone={nextMilestone} penalty={penaltyActive} />
      </Appear>

      {/* Penalty Zone */}
      {penalty ? (
        <Appear index={2}>
          <SystemWindow title={penalty.status === 'COMPLETED' ? 'Penalty cleared' : 'Penalty Zone'} accent={c.danger}>
            <Text variant="callout" dim>
              {penalty.status === 'COMPLETED'
                ? dailyDone ? 'Streak saved. The System acknowledges your resolve.' : 'Now finish today’s Daily Quest to save your streak.'
                : 'You missed a day. Survive 5 minutes AND finish today’s Daily Quest to keep your streak.'}
            </Text>
            {penalty.status !== 'COMPLETED' && penalty.options.length > 1 ? (
              <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                {penalty.options.map((opt, oi) => {
                  const on = (penalty.progress.option ?? 0) === oi;
                  return (
                    <PressableScale key={oi} haptic="tap" onPress={() => progress.mutate({ quest: penalty, progress: { option: oi, '0': 0 } })}
                      accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={exerciseName(opt[0]!.exerciseId)}
                      style={{ flex: 1, padding: spacing[3], borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? c.danger : c.border, backgroundColor: on ? `${c.danger}14` : c.surfaceRaised }}>
                      <Text variant="callout">{exerciseName(opt[0]!.exerciseId)}</Text>
                      <Text variant="caption" muted>{`${opt[0]!.target}${opt[0]!.unit === 'sec' ? ' s' : ' reps'}`}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            ) : null}
            <View>
              {activeSlots(penalty).map((s, i, all) => (
                <SlotRow key={`${s.exerciseId}-${i}`} slot={s} done={penalty.progress[String(i)] ?? 0} color={c.danger} last={i === all.length - 1}
                  locked={penalty.status === 'COMPLETED'} onSet={(v) => set(penalty, i, v)} />
              ))}
            </View>
            {penalty.status !== 'COMPLETED' ? <FollowButton id={penalty.id} /> : null}
          </SystemWindow>
        </Appear>
      ) : null}

      {/* Daily Quest */}
      <Appear index={3}>
        <SystemWindow
          title={ritual ? 'Rest Ritual' : 'Daily Quest'}
          accent={c.danger}
          right={<Pill icon={dailyDone ? 'checkmark-circle' : 'time-outline'} label={dailyDone ? 'Cleared' : deadline} color={dailyDone ? c.success : c.textDim} />}>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" muted style={{ flex: 1 }}>
                {ritual ? 'Three gentle mobility holds. Rest days still count.'
                  : data.trainingDay ? 'A lighter activation set on training days.' : 'Scaled to your tests. Any number of sets, good form.'}
              </Text>
              <Text variant="caption" color={dailyDone ? c.success : c.text} style={{ fontFamily: 'Inter_600SemiBold' }}>{`${slotsDone} / ${slots.length}`}</Text>
            </View>
            <Bar ratio={questRatio(daily)} height={5} color={dailyDone ? c.success : c.danger} />
          </View>
          <View>
            {slots.map((s, i) => (
              <SlotRow key={`${s.exerciseId}-${i}`} slot={s} done={daily.progress[String(i)] ?? 0} color={c.danger} last={i === slots.length - 1}
                locked={dailyDone || streak.sickToday} onSet={(v) => set(daily, i, v)} />
            ))}
          </View>
          {!dailyDone && !streak.sickToday ? <FollowButton id={daily.id} /> : null}
          {!dailyDone && daily.options.length > 0 ? (
            <Button variant="ghost" size="md" label={ritual ? 'Do the full Daily Quest instead' : 'Rest day? Do the 3-minute Rest Ritual'}
              onPress={() => progress.mutate({ quest: daily, progress: { option: ritual ? 0 : 1, '0': 0, '1': 0, '2': 0 } })} />
          ) : null}
          {!dailyDone && !streak.sickToday ? <Text variant="caption" muted>Failure to complete will result in an appropriate penalty.</Text> : null}
        </SystemWindow>
      </Appear>

      {/* Side quests */}
      <Appear index={4} style={{ gap: spacing[3] }}>
        <SectionHeader title="Side quests" action={data.sides.length ? `${data.sides.filter((q) => q.status === 'COMPLETED').length} / ${data.sides.length} done` : '+15 XP each'} />
        {data.sides.length === 0 ? <SidePicker onConfirm={(ids) => chooseSides.mutate(ids)} /> : (
          <TileGrid>
            {data.sides.map((q) => {
              const def = sideQuests.find((s) => s.id === q.templateId)!;
              const done = q.status === 'COMPLETED';
              const auto = def.verify !== 'manual';
              const verified = def.verify === 'auto:program-workout'
                ? history.some((h) => h.date === data.date && h.kind === 'program')
                : def.verify.startsWith('auto:quick:') ? history.some((h) => h.date === data.date && h.dayId === def.verify.slice('auto:quick:'.length)) : true;
              return (
                <SideTile key={q.id} icon={def.icon as never} color={def.color} title={def.title}
                  status={done ? '+15 XP earned' : auto ? (verified ? 'Verified · ready to claim' : 'Verified automatically') : 'Tick it when done'}
                  action={done ? 'done' : { label: auto ? 'Claim' : 'Done', disabled: auto && !verified, onPress: () => progress.mutate({ quest: q, progress: { done: 1 } }) }} />
              );
            })}
          </TileGrid>
        )}
      </Appear>

      {/* Weekly boss */}
      {boss ? (
        <Appear index={5} style={{ gap: spacing[3] }}>
          <SectionHeader title="Weekly boss" action="Resets Monday" />
          <BossCard boss={boss} onClaim={() => claimBoss.mutate(boss)} claiming={claimBoss.isPending} />
        </Appear>
      ) : null}

      {/* Sick mode */}
      <Appear index={6}>
        <PressableScale haptic="tap" disabled={!streak.sickToday && (!streak.sickAllowed || dailyDone)} onPress={() => setSick.mutate(!streak.sickToday)}
          accessibilityRole="switch" accessibilityState={{ checked: streak.sickToday, disabled: !streak.sickToday && (!streak.sickAllowed || dailyDone) }}
          accessibilityLabel="Sick or injured today: freeze streak">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[4], borderRadius: radius.lg, borderWidth: 1, borderColor: c.border }}>
            <Icon name="medkit-outline" size={18} color={streak.sickToday ? c.mana : c.textDim} />
            <View style={{ flex: 1 }}>
              <Text variant="callout">Sick or injured today?</Text>
              <Text variant="caption" muted>{streak.sickToday ? 'Streak frozen for today. Rest well.' : !streak.sickAllowed ? 'Used 7 sick days in the last 30.' : 'Freezes your streak. Up to 7 days in any 30.'}</Text>
            </View>
            <Icon name={streak.sickToday ? 'toggle' : 'toggle-outline'} size={30} color={streak.sickToday ? c.mana : c.textMuted} />
          </View>
        </PressableScale>
      </Appear>
    </Screen>
  );
}

function SidePicker({ onConfirm }: { onConfirm: (ids: string[]) => void }) {
  const { spacing } = useTheme();
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <View style={{ gap: spacing[3] }}>
      <Text variant="caption" muted>Pick up to 3 for today. Some are checked automatically from your logs.</Text>
      <TileGrid>
        {sideQuests.map((s) => {
          const on = picked.includes(s.id);
          return (
            <SideTile key={s.id} icon={s.icon as never} color={s.color} title={s.title} selected={on}
              status={s.verify !== 'manual' ? 'Verified automatically' : 'Tick it when done'}
              onPress={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : p.length < 3 ? [...p, s.id] : p))} />
          );
        })}
      </TileGrid>
      <Button label={picked.length ? `Accept ${picked.length} quest${picked.length === 1 ? '' : 's'}` : 'Pick up to 3'} disabled={picked.length === 0} onPress={() => onConfirm(picked)} />
    </View>
  );
}

/** Opens the quest in the follow-along player (VISUALS.md §4). */
function FollowButton({ id }: { id: string }) {
  return <Button size="md" icon="play-circle" label="Follow along" onPress={() => router.push(`/workout/quest/${id}`)} />;
}
