import { workoutTypes } from '@lb/content';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { exerciseById, useToday, useWorkoutSession } from '@/features/training';
import { range, ROLE_LABEL } from '@/features/training/format';
import { useTheme } from '@/theme';
import { Appear, Button, Card, Icon, Page, Pill, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';

const READINESS = [
  { label: 'Great', value: 85, icon: 'flash' as const },
  { label: 'Okay', value: 60, icon: 'remove-circle-outline' as const },
  { label: 'Tired', value: 30, icon: 'bed-outline' as const },
];

/** Today's workout overview + 3-tap readiness check (SYSTEMS.md §3.5) before starting. */
export default function WorkoutPreview() {
  const { c, spacing, radius } = useTheme();
  const [readiness, setReadiness] = useState<number | null>(null);
  const today = useToday(readiness);
  const start = useWorkoutSession((s) => s.start);
  const w = today.workout;
  const type = workoutTypes.find((t) => t.id === today.program.typeId);
  const sets = w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.kind === 'working').length, 0);

  return (
    <Page
      accent={type?.color}
      header={<ScreenHeader title={today.program.name} icon="close" />}
      footer={
        <Button
          label="Start workout"
          icon="play"
          onPress={() => {
            start(w, { programId: today.program.id, dayId: w.dayId });
            router.replace('/workout/session');
          }}
        />
      }>
      <Appear index={0} style={{ gap: spacing[2] }}>
        {type ? <Pill icon={type.icon as never} label={type.name} color={type.color} /> : null}
        <Text variant="title">{w.name}</Text>
        <View style={{ flexDirection: 'row', gap: spacing[4] }}>
          <Meta icon="time-outline" text={`~${w.estimatedMinutes} min`} />
          <Meta icon="list-outline" text={`${w.exercises.length} exercises`} />
          <Meta icon="layers-outline" text={`${sets} working sets`} />
        </View>
      </Appear>

      <Appear index={1}>
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

      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title="The plan" />
        <Card padded={false}>
          <Row icon="body-outline" title="Warm-up" detail="5 min · general movement + ramp-up sets" first />
          {w.exercises.map((pe) => {
            const e = exerciseById.get(pe.exerciseId)!;
            const working = pe.sets.filter((s) => s.kind === 'working');
            const s0 = working[0]!;
            const target = s0.seconds ? `${range(s0.seconds)} s` : `${range(s0.reps)} reps`;
            return (
              <PressableScale key={pe.slotIndex} haptic="tap" onPress={() => router.push(`/exercise/${e.id}`)} accessibilityRole="button" accessibilityLabel={e.name}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: 1, borderColor: c.border }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="callout">{e.name}</Text>
                    <Text variant="caption" muted>{`${ROLE_LABEL[pe.role]} · ${working.length} × ${target}${s0.loadKg != null ? ` · ${s0.loadKg} kg` : ''}`}</Text>
                  </View>
                  <Icon name="information-circle-outline" size={18} color={c.textMuted} />
                </View>
              </PressableScale>
            );
          })}
          <Row icon="leaf-outline" title="Cool-down" detail="3 min · mobility for the muscles trained" />
        </Card>
        {w.unfilled.length ? (
          <Text variant="caption" color={c.warning}>{`Skipped ${w.unfilled.length} slot(s) that need equipment you don't have.`}</Text>
        ) : null}
      </Appear>
    </Page>
  );
}

function Row({ icon, title, detail, first }: { icon: React.ComponentProps<typeof Icon>['name']; title: string; detail: string; first?: boolean }) {
  const { c, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: first ? 0 : 1, borderColor: c.border }}>
      <Icon name={icon} size={18} />
      <View style={{ flex: 1 }}>
        <Text variant="callout" dim>{title}</Text>
        <Text variant="caption" muted>{detail}</Text>
      </View>
    </View>
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
