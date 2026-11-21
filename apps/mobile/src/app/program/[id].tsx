import { starterProgramIds } from '@lb/content';
import { ageBand, deloadEveryWeeks, LEVELS, personalizeWorkout, type Experience } from '@lb/engine';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useFeature } from '@/features/paywall';
import {
  catalog, exerciseName, programById, useChangeLevel, usePersonalContext, useTraining, useTrainingProfile, workoutTypes,
} from '@/features/training';
import { useSetProgram } from '@/features/training/sync';
import { LEVEL_LABEL, LevelChip, setsRepsText, Shelf } from '@/features/training/TrainCards';
import { ExerciseMedia } from '@/features/visuals';
import { useTheme } from '@/theme';
import { Appear, Button, Card, Icon, type IconName, Page, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';

const LOC: Record<string, string> = { HOME: 'Home', GYM: 'Gym', HYBRID: 'Home or gym' };
const GOAL: Record<string, string> = { cut: 'Lose fat', maintain: 'Stay fit', recomp: 'Recomp', bulk: 'Build muscle' };
const WHERE: Record<string, string> = { HOME: 'at home', GYM: 'in the gym', HYBRID: 'at home or in the gym' };
const SHORT: Record<Experience, string> = { beginner: 'Begin.', novice: 'Novice', intermediate: 'Inter.', advanced: 'Adv.', pro: 'Pro' };
const FOCUS: Record<string, string> = { upper: 'Upper body', lower: 'Lower body', full: 'Full body' };

/** Program detail (docs/plans/TRAIN_REDESIGN.md §3.4): who it's for, week-by-week outline at your level, start / change level. */
export default function ProgramDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = programById.get(id ?? '');
  const { c, spacing, radius } = useTheme();
  const profile = useTrainingProfile();
  const ctx = usePersonalContext();
  const activeId = useTraining((s) => s.activeProgramId);
  const setProgram = useSetProgram();
  const { changeLevel, isPending } = useChangeLevel();
  const allPrograms = useFeature('allPrograms').enabled;
  const [level, setLevel] = useState<Experience>(profile.experience);
  const [week, setWeek] = useState(1);

  const band = ageBand(ctx.ageYears);
  const deloadEvery = p ? deloadEveryWeeks(p.deloadEvery, band) : 0;
  const isDeload = !!p && week % deloadEvery === 0;
  // every day at the chosen level, personalised (kit, sex, age, history); deload weeks run Light.
  // The outline shows the full program (no time cap); the Train tab's Time setting trims a day to fit.
  const days = useMemo(() => (p ? p.days.map((d) => personalizeWorkout(d, catalog, { ...ctx, experience: level, sessionMinutes: 150 },
    { intensity: isDeload ? 'light' : 'standard', where: null, minutes: null })) : []), [p, ctx, level, isDeload]);

  if (!p) {
    return (
      <Page header={<ScreenHeader title="Program" />}>
        <Text variant="callout" dim>This program isn't available.</Text>
      </Page>
    );
  }

  const type = workoutTypes.find((t) => t.id === p.typeId);
  const color = type?.color ?? c.accent;
  const isActive = (activeId ?? null) === p.id;
  const locked = !allPrograms && !starterProgramIds.has(p.id) && !isActive;
  const fitsLevel = p.levels.includes(level);
  const levels = `${LEVEL_LABEL[p.levels[0]!]}${p.levels.length > 1 ? ` to ${LEVEL_LABEL[p.levels[p.levels.length - 1]!]}` : ''}`;
  const whoFor = `${levels} hunters training ${p.locations.includes('HYBRID') || p.locations.length > 1 ? WHERE.HYBRID : WHERE[p.locations[0]!]}.`;
  const goals = [...new Set(p.goals.map((g) => GOAL[g]!))];

  return (
    <Page
      accent={color}
      header={<ScreenHeader title="" right={
        <PressableScale haptic="tap" onPress={() => router.push('/programs')} accessibilityRole="button" accessibilityLabel="All programs">
          <Text variant="callout" color={c.accentGlow}>All programs</Text>
        </PressableScale>
      } />}
      footer={
        isActive ? (
          <Button variant="secondary" icon="checkmark-circle" label="Your current program" onPress={() => router.dismissTo('/train')} />
        ) : locked ? (
          <Button variant="secondary" icon="lock-closed" label="Part of Premium" disabled onPress={() => {}} />
        ) : (
          <Button label="Start this program" icon="play" onPress={() => { setProgram(p.id); router.dismissTo('/train'); }} />
        )
      }>
      {/* cover */}
      <Appear index={0}>
        <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${color}55` }}>
          <LinearGradient colors={[`${color}66`, `${color}14`, c.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: spacing[4], paddingTop: spacing[6], gap: spacing[2] }}>
            <View pointerEvents="none" style={{ position: 'absolute', right: -20, top: -10, opacity: 0.16 }}>
              <Icon name={(type?.icon ?? 'barbell') as IconName} size={170} color={color} />
            </View>
            <Text variant="label" color={c.textDim}>{type?.name ?? 'Program'}</Text>
            <Text variant="title">{p.name}</Text>
            <Text variant="callout" dim>{p.summary}</Text>
            <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
              <Stat icon="calendar-outline" value={`${p.blockWeeks}`} label="weeks" />
              <Stat icon="repeat-outline" value={p.daysPerWeek.join('–')} label="days / week" />
              <Stat icon="location-outline" value={p.locations.map((l) => LOC[l]!.split(' ')[0]).join(' · ')} label="where" />
            </View>
          </LinearGradient>
        </View>
      </Appear>

      <Appear index={1}>
        <Card>
          <Text variant="label" muted>Who it's for</Text>
          <Text variant="callout">{whoFor}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {goals.map((g) => (
              <View key={g} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: `${color}22` }}>
                <Text variant="micro" color={c.text}>{g}</Text>
              </View>
            ))}
          </View>
          <Text variant="caption" muted>{`A lighter deload week every ${deloadEvery} weeks${deloadEvery < p.deloadEvery ? ' (sooner for your age, for recovery)' : ''}.`}</Text>
        </Card>
      </Appear>

      {/* level ladder */}
      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title="Your level" />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {LEVELS.map((l) => {
            const on = l === level;
            const mine = l === profile.experience;
            return (
              <PressableScale key={l} haptic="tap" onPress={() => setLevel(l)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                accessibilityLabel={`${LEVEL_LABEL[l]}${mine ? ', your level' : ''}`}
                style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing[2], borderRadius: radius.md, borderWidth: on ? 1.5 : 1, borderColor: on ? c.accent : c.border, backgroundColor: on ? `${c.accent}26` : c.surface }}>
                <Text variant="caption" color={on ? c.text : c.textDim} style={on ? { fontFamily: 'Inter_600SemiBold' } : undefined}>{SHORT[l]}</Text>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: mine ? c.accentGlow : 'transparent' }} />
              </PressableScale>
            );
          })}
        </View>
        <Text variant="caption" muted>
          {fitsLevel ? 'The outline below shows this program at that level: sets, reps and effort change with the level.' : `Written for ${levels.toLowerCase()}. The coach adapts it to ${LEVEL_LABEL[level].toLowerCase()}, but another program may suit you better.`}
        </Text>
        {level !== profile.experience ? (
          <Button size="md" variant="secondary" icon="trending-up-outline" loading={isPending}
            label={`Set my level to ${LEVEL_LABEL[level]}`} onPress={() => changeLevel(level)} />
        ) : null}
      </Appear>

      {/* week by week */}
      <Appear index={3} style={{ gap: spacing[3] }}>
        <SectionHeader title="Week by week" />
        <Shelf>
          {Array.from({ length: p.blockWeeks }, (_, i) => i + 1).map((n) => {
            const on = n === week;
            const deload = n % deloadEvery === 0;
            return (
              <PressableScale key={n} haptic="tap" onPress={() => setWeek(n)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                accessibilityLabel={`Week ${n}${deload ? ', deload' : ''}`}
                style={{ minWidth: 64, alignItems: 'center', paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderRadius: radius.md, borderWidth: on ? 1.5 : 1, borderColor: on ? color : c.border, backgroundColor: on ? `${color}26` : c.surface }}>
                <Text variant="micro" muted>WEEK</Text>
                <Text variant="headline">{n}</Text>
                <Text variant="micro" color={deload ? c.mana : 'transparent'}>Deload</Text>
              </PressableScale>
            );
          })}
        </Shelf>
        {isDeload ? <Text variant="caption" color={c.mana}>Deload week: one set fewer and easier effort, so you come back stronger.</Text> : (
          <Text variant="caption" muted>Short on time? The Time setting on the Train tab trims accessories first.</Text>
        )}
        {days.map((w, di) => (
          <Card key={w.dayId} padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], paddingBottom: spacing[2] }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}26` }}>
                <Text variant="callout" color={color} style={{ fontFamily: 'Inter_600SemiBold' }}>{di + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="heading">{w.name}</Text>
                <Text variant="caption" muted>{`${FOCUS[w.focus]} · ${w.exercises.length} exercises · ~${w.estimatedMinutes} min`}</Text>
              </View>
              <LevelChip level={level} />
            </View>
            <View style={{ paddingHorizontal: spacing[4], paddingBottom: spacing[2] }}>
              {w.exercises.map((e, i) => (
                <View key={`${e.slotIndex}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                  <ExerciseMedia exerciseId={e.exerciseId} variant="thumb" height={40} />
                  <Text variant="callout" numberOfLines={1} style={{ flex: 1 }}>{exerciseName(e.exerciseId)}</Text>
                  <Text variant="caption" color={c.accentGlow}>{setsRepsText(e)}</Text>
                </View>
              ))}
            </View>
          </Card>
        ))}
      </Appear>
    </Page>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  const { c, radius, spacing } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2, padding: spacing[2] + 2, borderRadius: radius.md, backgroundColor: 'rgba(0,0,0,0.28)' }}>
      <Icon name={icon} size={14} color={c.textDim} />
      <Text variant="headline" numberOfLines={1}>{value}</Text>
      <Text variant="micro" muted>{label}</Text>
    </View>
  );
}
