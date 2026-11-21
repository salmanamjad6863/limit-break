import { workoutTypes } from '@lb/content';
import type { WorkoutEdits } from '@lb/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';
import Animated from 'react-native-reanimated';
import { exerciseById, exerciseName, useTrainingProfile, useWorkoutPlan, useWorkoutSession } from '@/features/training';
import { estimateKcal, ExerciseRow, LevelChip, ModeBar, setsRepsText } from '@/features/training/TrainCards';
import { ExerciseMedia, MuscleMap } from '@/features/visuals';
import { useTheme } from '@/theme';
import { Appear, Button, Card, Icon, type IconName, Page, Pill, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';

const READINESS = [
  { label: 'Great', value: 85, icon: 'flash' as const },
  { label: 'Okay', value: 60, icon: 'remove-circle-outline' as const },
  { label: 'Tired', value: 30, icon: 'bed-outline' as const },
];

const KIT_LABEL: Record<string, string> = {
  dumbbells: 'Dumbbells', bands: 'Bands', barbell: 'Barbell', pull_up_bar: 'Pull-up bar', bench: 'Bench', rack: 'Rack',
  machines: 'Machines', cable: 'Cable', kettlebell: 'Kettlebell', dip_bars: 'Dip bars',
};

/**
 * Workout preview (docs/plans/TRAIN_REDESIGN.md §3.2): demo hero, muscles worked, kit, the mode bar,
 * and an editable exercise list (swap · reorder · remove) before starting. Edits apply to today only.
 */
export default function WorkoutPreview() {
  const { c, spacing, radius } = useTheme();
  const [readiness, setReadiness] = useState<number | null>(null);
  const [guided, setGuided] = useState(true);
  const [editing, setEditing] = useState(false);
  const [swapping, setSwapping] = useState<number | null>(null);
  const { focused: focusedId } = useLocalSearchParams<{ focused?: string }>();
  const plan = useWorkoutPlan(focusedId, readiness);
  const profile = useTrainingProfile();
  const start = useWorkoutSession((s) => s.start);
  const active = useWorkoutSession((s) => s.active);
  const w = plan.workout;
  const type = workoutTypes.find((t) => t.id === plan.typeId);
  const sets = w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.kind === 'working').length, 0);
  const first = w.exercises[0];
  const kit = [...new Set(w.exercises.flatMap((pe) => {
    const e = exerciseById.get(pe.exerciseId);
    return [...(e?.equipment ?? []), ...(e?.anyOf?.slice(0, 1) ?? [])];
  }))];
  const edited = !!(plan.edits.swap && Object.keys(plan.edits.swap).length) || !!plan.edits.remove?.length || !!plan.edits.order?.length;

  const edit = (next: WorkoutEdits) => plan.setEdits(next);
  const move = (i: number, d: -1 | 1) => {
    const order = [...w.templateSlots];
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    edit({ ...plan.edits, order });
  };
  const remove = (i: number) => {
    if (w.exercises.length <= 1) return;
    setSwapping(null);
    edit({ ...plan.edits, remove: [...(plan.edits.remove ?? []), w.templateSlots[i]!] });
  };
  const swap = (i: number, exerciseId: string) => {
    setSwapping(null);
    edit({ ...plan.edits, swap: { ...(plan.edits.swap ?? {}), [w.templateSlots[i]!]: exerciseId } });
  };

  return (
    <Page
      accent={type?.color}
      header={<ScreenHeader title={plan.title} icon="close" />}
      footer={
        <Button
          label={active ? 'Start (ends the open workout)' : 'Start workout'}
          icon="play"
          onPress={() => {
            // Guided for Beginner/Novice, the set table for everyone else (switchable mid-workout)
            const view = profile.experience === 'beginner' || profile.experience === 'novice' ? 'guided' : 'log';
            start(w, { ...plan.start, view });
            router.replace(guided ? '/workout/flow?kind=warmup' : '/workout/session');
          }}
        />
      }>
      {/* hero: the first exercise's demo (placeholder until the clip provider is connected) */}
      {first ? (
        <Appear index={0}>
          <View>
            <ExerciseMedia exerciseId={first.exerciseId} variant="hero" height={210} />
            <View pointerEvents="none" style={{ position: 'absolute', left: spacing[3], top: spacing[3] }}>
              <Pill icon="play-circle" label={`First up: ${exerciseName(first.exerciseId)}`} color="#FFFFFF" />
            </View>
          </View>
        </Appear>
      ) : null}

      <Appear index={1} style={{ gap: spacing[2] }}>
        <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
          {type ? <Pill icon={type.icon as never} label={type.name} color={type.color} /> : null}
          <LevelChip level={profile.experience} />
        </View>
        <Text variant="title">{w.name}</Text>
        {plan.focused ? (
          <Text variant="callout" dim>{`${plan.focused.summary} A one-off session: your program stays where it is.`}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing[4], rowGap: 4 }}>
          <Meta icon="time-outline" text={`${w.estimatedMinutes} min`} />
          <Meta icon="list-outline" text={`${w.exercises.length} exercises`} />
          <Meta icon="layers-outline" text={`${sets} working sets`} />
          <Meta icon="flame-outline" text={`~${estimateKcal(w.estimatedMinutes, profile.weightKg, plan.mode.intensity)} kcal`} />
        </View>
      </Appear>

      <Appear index={1}>
        <Card>
          <View style={{ flexDirection: 'row', gap: spacing[4], alignItems: 'center' }}>
            <MuscleMap
              primary={[...new Set(w.exercises.filter((pe) => pe.role !== 'core').flatMap((pe) => exerciseById.get(pe.exerciseId)?.primary ?? []))].filter((m) => m !== 'full_body')}
              secondary={[...new Set(w.exercises.flatMap((pe) => exerciseById.get(pe.exerciseId)?.secondary ?? []))]}
              width={170}
            />
            <View style={{ flex: 1, gap: spacing[2] }}>
              <Text variant="label" muted>You need</Text>
              {kit.length ? kit.map((k) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkmark-circle-outline" size={14} color={c.success} />
                  <Text variant="caption" dim>{KIT_LABEL[k] ?? k}</Text>
                </View>
              )) : <Text variant="caption" dim>No equipment</Text>}
            </View>
          </View>
        </Card>
      </Appear>

      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title="Adjust today" />
        <Card>
          <ModeBar mode={plan.mode} onChange={plan.setMode} />
        </Card>
      </Appear>

      <Appear index={2}>
        <Card>
          <Text variant="heading">How do you feel today?</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            {READINESS.map((r) => {
              const on = readiness === r.value;
              return (
                <PressableScale
                  key={r.label}
                  haptic="tap"
                  onPress={() => setReadiness(on ? null : r.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Feeling ${r.label.toLowerCase()}`}
                  style={{
                    flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing[3], borderRadius: radius.md,
                    borderWidth: 1.5, borderColor: on ? c.accent : c.border, backgroundColor: on ? `${c.accent}1A` : c.surfaceRaised,
                  }}>
                  <Icon name={r.icon} size={20} color={on ? c.accentGlow : c.textDim} />
                  <Text variant="callout" color={on ? c.text : c.textDim}>{r.label}</Text>
                </PressableScale>
              );
            })}
          </View>
          {w.lightened ? (
            <Text variant="caption" color={c.warning}>Lighter session: fewer sets and an easier effort target. Recovery is training too.</Text>
          ) : (
            <Text variant="caption" muted>Optional. If you're tired, the coach lightens today's session.</Text>
          )}
        </Card>
      </Appear>

      <Appear index={3} style={{ gap: spacing[3] }}>
        <SectionHeader title="The plan" action={editing ? 'Done' : 'Edit'} onAction={() => { setEditing((e) => !e); setSwapping(null); }} />
        <Card padded={false}>
          <PressableScale haptic="tap" onPress={() => setGuided((g) => !g)} accessibilityRole="switch" accessibilityState={{ checked: guided }} accessibilityLabel="Guided warm-up">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4] }}>
              <Icon name="body-outline" size={18} color={guided ? c.warning : c.textMuted} />
              <View style={{ flex: 1 }}>
                <Text variant="callout">Guided warm-up</Text>
                <Text variant="caption" muted>{guided ? 'About 5 min, follow along · then ramp-up sets' : 'Off · ramp-up sets only'}</Text>
              </View>
              <Icon name={guided ? 'toggle' : 'toggle-outline'} size={28} color={guided ? c.warning : c.textMuted} />
            </View>
          </PressableScale>
          <LayoutAnimationConfig skipEntering>
            <View style={{ paddingHorizontal: spacing[4], borderTopWidth: 1, borderColor: c.border }}>
              {w.exercises.map((pe, i) => (
                <Animated.View key={`${w.templateSlots[i]}`} layout={LinearTransition.duration(220)}>
                  {editing ? (
                    <EditRow
                      exerciseId={pe.exerciseId} detail={setsRepsText(pe)} last={i === w.exercises.length - 1}
                      canUp={i > 0} canDown={i < w.exercises.length - 1} canRemove={w.exercises.length > 1}
                      onUp={() => move(i, -1)} onDown={() => move(i, 1)} onRemove={() => remove(i)}
                      swapOpen={swapping === i} onSwap={() => setSwapping(swapping === i ? null : i)}
                      alternatives={pe.alternatives.filter((id) => !w.exercises.some((x) => x.exerciseId === id))} onPick={(id) => swap(i, id)}
                    />
                  ) : (
                    <ExerciseRow e={pe} index={i} last={i === w.exercises.length - 1} />
                  )}
                </Animated.View>
              ))}
            </View>
          </LayoutAnimationConfig>
          <Row icon="leaf-outline" title="Cool-down" detail="About 4 min, follow along · offered when you finish" />
        </Card>
        {edited ? (
          <Button variant="ghost" size="md" icon="refresh" label="Reset to the coach's plan" onPress={() => { setSwapping(null); plan.setEdits(null); }} />
        ) : editing ? (
          <Text variant="caption" muted>Swap, reorder or remove exercises. Changes apply to today only.</Text>
        ) : null}
        {w.unfilled.length ? (
          <Text variant="caption" color={c.warning}>{`Skipped ${w.unfilled.length} slot(s) that need equipment you don't have.`}</Text>
        ) : null}
      </Appear>
    </Page>
  );
}

function EditRow(p: {
  exerciseId: string; detail: string; last: boolean; canUp: boolean; canDown: boolean; canRemove: boolean;
  onUp: () => void; onDown: () => void; onRemove: () => void;
  swapOpen: boolean; onSwap: () => void; alternatives: string[]; onPick: (id: string) => void;
}) {
  const { c, spacing, radius } = useTheme();
  const name = exerciseName(p.exerciseId);
  return (
    <View style={{ borderBottomWidth: p.last ? 0 : 1, borderColor: c.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] + 2 }}>
        <View style={{ gap: 2 }}>
          <IconBtn icon="chevron-up" label={`Move ${name} up`} disabled={!p.canUp} onPress={p.onUp} />
          <IconBtn icon="chevron-down" label={`Move ${name} down`} disabled={!p.canDown} onPress={p.onDown} />
        </View>
        <ExerciseMedia exerciseId={p.exerciseId} variant="thumb" height={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="callout" numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>{name}</Text>
          <Text variant="caption" color={c.accentGlow}>{p.detail}</Text>
        </View>
        <PressableScale haptic="tap" onPress={p.onSwap} disabled={!p.alternatives.length} accessibilityRole="button" accessibilityLabel={`Swap ${name}`}
          accessibilityState={{ expanded: p.swapOpen, disabled: !p.alternatives.length }}
          style={{ width: 38, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: p.swapOpen ? c.accent : c.border, backgroundColor: p.swapOpen ? `${c.accent}26` : 'transparent', opacity: p.alternatives.length ? 1 : 0.35 }}>
          <Icon name="swap-horizontal" size={16} color={p.swapOpen ? c.text : c.textDim} />
        </PressableScale>
        <IconBtn icon="trash-outline" label={`Remove ${name}`} disabled={!p.canRemove} onPress={p.onRemove} color={c.danger} />
      </View>
      {p.swapOpen ? (
        <View style={{ gap: 2, paddingBottom: spacing[3], paddingLeft: spacing[8] }}>
          <Text variant="label" muted>Swap for</Text>
          {p.alternatives.map((id) => {
            const e = exerciseById.get(id);
            return (
              <PressableScale key={id} haptic="press" onPress={() => p.onPick(id)} accessibilityRole="button" accessibilityLabel={`Swap to ${exerciseName(id)}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 6 }}>
                  <ExerciseMedia exerciseId={id} variant="thumb" height={40} />
                  <View style={{ flex: 1 }}>
                    <Text variant="callout" numberOfLines={1}>{exerciseName(id)}</Text>
                    <Text variant="micro" muted>{(e?.equipment.length ? e.equipment.map((k) => KIT_LABEL[k] ?? k).join(' · ') : 'Bodyweight')}</Text>
                  </View>
                  <Icon name="arrow-forward-circle-outline" size={20} color={c.accentGlow} />
                </View>
              </PressableScale>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function IconBtn({ icon, label, onPress, disabled, color }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; color?: string }) {
  const { c } = useTheme();
  return (
    <PressableScale haptic="tap" onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
      hitSlop={6} style={{ width: 30, height: 26, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.25 : 1 }}>
      <Icon name={icon} size={18} color={color ?? c.textDim} />
    </PressableScale>
  );
}

function Row({ icon, title, detail }: { icon: IconName; title: string; detail: string }) {
  const { c, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: 1, borderColor: c.border }}>
      <Icon name={icon} size={18} />
      <View style={{ flex: 1 }}>
        <Text variant="callout" dim>{title}</Text>
        <Text variant="caption" muted>{detail}</Text>
      </View>
    </View>
  );
}

function Meta({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={15} />
      <Text variant="caption" dim>{text}</Text>
    </View>
  );
}
