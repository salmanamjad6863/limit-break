import { sideQuests } from '@lb/content';
import { activeSlots, type QuestDto } from '@lb/contracts';
import { STREAK } from '@lb/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useBoss, useQuestActions, useQuests } from '@/features/quests';
import { SlotRow } from '@/features/quests/SlotRow';
import { exerciseName, useTraining } from '@/features/training';
import { useQuestDeadline } from '@/lib/time';
import { useTheme } from '@/theme';
import { Appear, Bar, Button, Card, Icon, Pill, PressableScale, Screen, SectionHeader, SystemWindow, Text } from '@/ui';
import { Ring } from '@/ui/fx';

export default function QuestsScreen() {
  const { c, spacing } = useTheme();
  const { data } = useQuests();
  const { progress, chooseSides, setSick, claimBoss } = useQuestActions();
  const { data: boss } = useBoss();
  const deadline = useQuestDeadline();
  const history = useTraining((s) => s.history);

  if (!data) return <Screen title="Quests"><Text dim>Loading…</Text></Screen>;
  const { daily, penalty, streak } = data;
  const dailyDone = daily.status === 'COMPLETED';
  const ritual = daily.progress.option === 1;
  const nextMilestone = STREAK.milestones.find((m) => m > streak.current);

  const set = (q: QuestDto, i: number, v: number) => progress.mutate({ quest: q, progress: { [String(i)]: v } });

  return (
    <Screen title="Quests" subtitle="Small daily wins that compound." accent={penalty && penalty.status !== 'COMPLETED' ? c.danger : '#FF9F43'}>
      {/* Streak */}
      <Appear index={1}>
        <Card tint="#FF9F43">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
            <Ring ratio={nextMilestone ? streak.current / nextMilestone : 1} size={82} stroke={8} color="#FF9F43">
              <Icon name="flame" size={22} color="#FF9F43" />
            </Ring>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title">{`${streak.current} day${streak.current === 1 ? '' : 's'}`}</Text>
              <Text variant="caption" dim>{nextMilestone ? `${nextMilestone - streak.current} to the ${nextMilestone}-day title` : 'Legendary streak'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                {Array.from({ length: Math.max(streak.shields, 2) }, (_, i) => (
                  <Icon key={i} name={i < streak.shields ? 'shield' : 'shield-outline'} size={16} color={i < streak.shields ? c.mana : c.textMuted} />
                ))}
                <Text variant="caption" muted>{`${streak.shields} shield${streak.shields === 1 ? '' : 's'} · best ${streak.longest}`}</Text>
              </View>
            </View>
          </View>
        </Card>
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
                      style={{ flex: 1, padding: spacing[3], borderRadius: 12, borderWidth: 1.5, borderColor: on ? c.danger : c.border, backgroundColor: on ? `${c.danger}14` : c.surfaceRaised }}>
                      <Text variant="callout">{exerciseName(opt[0]!.exerciseId)}</Text>
                      <Text variant="caption" muted>{`${opt[0]!.target}${opt[0]!.unit === 'sec' ? ' s' : ' reps'}`}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            ) : null}
            {activeSlots(penalty).map((s, i) => (
              <SlotRow key={`${s.exerciseId}-${i}`} slot={s} done={penalty.progress[String(i)] ?? 0} color={c.danger} locked={penalty.status === 'COMPLETED'} onSet={(v) => set(penalty, i, v)} />
            ))}
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
          <Text variant="caption" muted>
            {ritual ? 'Three gentle mobility holds. Rest days still count for your streak.'
              : data.trainingDay ? 'A lighter activation set on training days. Any number of sets, good form.'
              : 'Scaled to your tests. Any number of sets, good form.'}
          </Text>
          {activeSlots(daily).map((s, i) => (
            <SlotRow key={`${s.exerciseId}-${i}`} slot={s} done={daily.progress[String(i)] ?? 0} color={c.danger} locked={dailyDone || streak.sickToday} onSet={(v) => set(daily, i, v)} />
          ))}
          {!dailyDone && !streak.sickToday ? <FollowButton id={daily.id} /> : null}
          {!dailyDone && daily.options.length > 0 ? (
            <Button variant="ghost" size="md" label={ritual ? 'Do the full Daily Quest instead' : 'Rest day? Do the 3-minute Rest Ritual'}
              onPress={() => progress.mutate({ quest: daily, progress: { option: ritual ? 0 : 1, '0': 0, '1': 0, '2': 0 } })} />
          ) : null}
          {!dailyDone ? <Text variant="caption" muted>Failure to complete will result in an appropriate penalty.</Text> : null}
        </SystemWindow>
      </Appear>

      {/* Side quests */}
      <Appear index={4} style={{ gap: spacing[3] }}>
        <SectionHeader title="Side quests" action={data.sides.length ? `${data.sides.filter((q) => q.status === 'COMPLETED').length} / ${data.sides.length}` : 'Pick 3'} />
        {data.sides.length === 0 ? <SidePicker onConfirm={(ids) => chooseSides.mutate(ids)} /> : (
          <Card>
            {data.sides.map((q) => {
              const def = sideQuests.find((s) => s.id === q.templateId)!;
              const done = q.status === 'COMPLETED';
              const auto = def.verify !== 'manual';
              const verified = def.verify === 'auto:program-workout'
                ? history.some((h) => h.date === data.date && h.kind === 'program')
                : def.verify.startsWith('auto:quick:') ? history.some((h) => h.date === data.date && h.dayId === def.verify.slice('auto:quick:'.length)) : true;
              return (
                <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                  <Icon name={def.icon as never} size={18} color={def.color} />
                  <View style={{ flex: 1 }}>
                    <Text variant="callout" color={done ? c.textDim : c.text}>{def.title}</Text>
                    <Text variant="caption" muted>{done ? '+15 XP earned' : auto ? (verified ? 'Verified, ready to claim' : 'Verified automatically') : 'Check off when done'}</Text>
                  </View>
                  {done ? <Icon name="checkmark-circle" size={22} color={c.success} /> : (
                    <Button size="md" variant={auto && !verified ? 'secondary' : 'primary'} label={auto ? 'Claim' : 'Done'} disabled={auto && !verified}
                      onPress={() => progress.mutate({ quest: q, progress: { done: 1 } })} />
                  )}
                </View>
              );
            })}
          </Card>
        )}
      </Appear>

      {/* Weekly boss */}
      {boss ? (
        <Appear index={5} style={{ gap: spacing[3] }}>
          <SectionHeader title="Weekly boss" action="Resets Monday" />
          <Card tint="#7C5CFF">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C5CFF22' }}>
                <Icon name="skull" size={22} color="#A893FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="heading">{boss.prophecy ? "The Shadow's Prophecy" : 'Your Shadow-Self'}</Text>
                <Text variant="caption" dim>{boss.prophecy ? 'Your first weeks: beat the plan the System set for you.' : 'You, four weeks ago. Out-train your past numbers.'}</Text>
              </View>
            </View>
            <Bar ratio={boss.hpPct / 100} height={10} color={boss.won ? c.success : '#A893FF'} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" muted>{boss.won ? 'Defeated' : `Boss HP ${boss.hpPct}%`}</Text>
              <Text variant="caption" dim>{`Score ${boss.score.toFixed(2)} / ${boss.required.toFixed(2)}`}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {([['Hard sets', 'hardSets'], ['Volume', 'volumeKg'], ['Cardio', 'cardioMin'], ['Quests', 'questDays']] as const).map(([label, k]) => (
                <View key={k} style={{ alignItems: 'center', flex: 1 }}>
                  <Text variant="heading">{boss.current[k].toLocaleString()}</Text>
                  <Text variant="micro" muted>{label}</Text>
                  {boss.past ? <Text variant="micro" color={boss.current[k] >= boss.past[k] ? c.success : c.textMuted}>{`vs ${boss.past[k].toLocaleString()}`}</Text> : null}
                </View>
              ))}
            </View>
            {boss.won && !boss.claimed ? <Button label="Claim victory · +150 XP" icon="trophy" onPress={() => claimBoss.mutate(boss)} /> : null}
            {boss.claimed ? <Pill icon="trophy" label="Victory claimed this week" color={c.success} /> : null}
          </Card>
        </Appear>
      ) : null}

      {/* Sick mode */}
      <Appear index={6}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <Icon name="medkit-outline" size={20} color={streak.sickToday ? c.mana : c.textDim} />
            <View style={{ flex: 1 }}>
              <Text variant="callout">Sick or injured today?</Text>
              <Text variant="caption" muted>{streak.sickToday ? 'Streak frozen for today. Rest well.' : 'Freezes your streak. Up to 7 days in any 30.'}</Text>
            </View>
            <Button size="md" variant={streak.sickToday ? 'primary' : 'secondary'} label={streak.sickToday ? 'On' : 'Off'}
              disabled={!streak.sickToday && (!streak.sickAllowed || dailyDone)} onPress={() => setSick.mutate(!streak.sickToday)} />
          </View>
        </Card>
      </Appear>
    </Screen>
  );
}

function SidePicker({ onConfirm }: { onConfirm: (ids: string[]) => void }) {
  const { c, spacing, radius } = useTheme();
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <Card>
      {sideQuests.map((s) => {
        const on = picked.includes(s.id);
        return (
          <PressableScale key={s.id} haptic="tap" accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={s.title}
            onPress={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : p.length < 3 ? [...p, s.id] : p))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[2], borderRadius: radius.md, backgroundColor: on ? `${c.accent}14` : 'transparent' }}>
            <Icon name={s.icon as never} size={18} color={s.color} />
            <View style={{ flex: 1 }}>
              <Text variant="callout">{s.title}</Text>
              {s.verify !== 'manual' ? <Text variant="caption" muted>Verified automatically</Text> : null}
            </View>
            <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={on ? c.accent : c.textMuted} />
          </PressableScale>
        );
      })}
      <Button label={`Accept ${picked.length || ''} quest${picked.length === 1 ? '' : 's'}`.replace('  ', ' ')} disabled={picked.length === 0} onPress={() => onConfirm(picked)} />
      <Text variant="caption" muted>+15 XP each, up to 3 a day.</Text>
    </Card>
  );
}

/** Opens the quest in the follow-along player (VISUALS.md §4). */
function FollowButton({ id }: { id: string }) {
  return <Button size="md" icon="play-circle" label="Follow along" onPress={() => router.push(`/workout/quest/${id}`)} />;
}
