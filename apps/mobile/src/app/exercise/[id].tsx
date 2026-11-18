import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { canPerform } from '@lb/engine';
import { View } from 'react-native';
import { catalog, exerciseById, muscleLabel, patternLabel, useTraining, useTrainingProfile } from '@/features/training';
import { ExerciseMedia, hasDemo, MuscleMap } from '@/features/visuals';
import { useTheme } from '@/theme';
import { Appear, Card, Icon, Page, Pill, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';
import { usePainFlags } from '@/features/training/sync';

const EQUIP: Record<string, string> = {
  pull_up_bar: 'Pull-up bar', bands: 'Bands', dumbbells: 'Dumbbells', kettlebell: 'Kettlebell', bench: 'Bench', barbell: 'Barbell',
  rack: 'Squat rack', cable: 'Cable', machines: 'Machines', dip_bars: 'Dip bars',
};

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ex = exerciseById.get(id ?? '');
  const { c, spacing, radius } = useTheme();
  const profile = useTrainingProfile();
  const best = useTraining((s) => (ex ? s.bestE1rm[ex.id] : undefined));
  const last = useTraining((s) => (ex ? s.lastSet[ex.id] : undefined));
  const avoided = useTraining((s) => (ex ? s.avoid.includes(ex.id) : false));
  const unflag = usePainFlags().unflagPain;
  if (!ex) return <Redirect href="/train" />;

  const equipment = [...ex.equipment, ...(ex.anyOf?.length ? [ex.anyOf.map((e) => EQUIP[e] ?? e).join(' or ')] : [])];
  const chain = ex.progression?.split('>') ?? catalog.find((e) => e.progression?.split('>').includes(ex.id))?.progression?.split('>');
  const alternatives = catalog.filter((e) => e.pattern === ex.pattern && e.id !== ex.id && canPerform(e, profile)).slice(0, 6);

  return (
    <Page header={<ScreenHeader title={patternLabel(ex.pattern)} />}>
      <Appear index={0} style={{ gap: spacing[2] }}>
        <Text variant="title">{ex.name}</Text>
        <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
          {ex.primary.map((m) => <Pill key={m} label={muscleLabel(m)} color={c.accentGlow} />)}
          {ex.secondary.map((m) => <Pill key={m} label={muscleLabel(m)} />)}
        </View>
      </Appear>

      <Appear index={1} style={{ gap: spacing[3] }}>
        {hasDemo(ex.id) ? <ExerciseMedia exerciseId={ex.id} variant="hero" /> : null}
        <Card style={{ alignItems: 'center' }}>
          <Text variant="label" muted style={{ alignSelf: 'flex-start' }}>Muscles worked</Text>
          <MuscleMap primary={ex.primary} secondary={ex.secondary} width={240} />
        </Card>
      </Appear>

      {avoided ? (
        <Card tint={c.warning}>
          <Text variant="heading">Flagged as painful</Text>
          <Text variant="callout" dim>This exercise is left out of your workouts.</Text>
          <PressableScale haptic="tap" onPress={() => unflag(ex.id)} accessibilityRole="button">
            <Text variant="callout" color={c.accentGlow}>Allow it again</Text>
          </PressableScale>
        </Card>
      ) : null}

      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title="How to do it" />
        <Card>
          {ex.cues.map((cue, k) => (
            <View key={k} style={{ flexDirection: 'row', gap: spacing[3] }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${c.accent}26` }}>
                <Text variant="micro" color={c.accentGlow}>{k + 1}</Text>
              </View>
              <Text variant="body" style={{ flex: 1 }}>{cue}</Text>
            </View>
          ))}
          {ex.mistakes.length ? (
            <View style={{ gap: 6, marginTop: spacing[1] }}>
              <Text variant="label" color={c.warning}>Common mistakes</Text>
              {ex.mistakes.map((m) => (
                <View key={m} style={{ flexDirection: 'row', gap: spacing[2] }}>
                  <Icon name="close-circle" size={16} color={c.warning} />
                  <Text variant="callout" dim style={{ flex: 1 }}>{m}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      </Appear>

      <Appear index={3}>
        <Card>
          <Row k="Equipment" v={equipment.length ? equipment.map((e) => EQUIP[e] ?? e).join(', ') : 'None'} />
          <Row k="Difficulty" v={`${ex.difficulty} / 5`} />
          <Row k="Your best (e1RM)" v={best ? `${Math.round(best)} kg` : '—'} />
          <Row k="Last time" v={last?.reps ? `${last.reps} reps${last.loadKg ? ` × ${last.loadKg} kg` : ''}` : '—'} />
        </Card>
      </Appear>

      {chain && chain.length > 1 ? (
        <Appear index={4} style={{ gap: spacing[3] }}>
          <SectionHeader title="Progression path" />
          <Card>
            {chain.map((cid, k) => {
              const here = cid === ex.id;
              return (
                <PressableScale key={cid} haptic="tap" onPress={() => router.setParams({ id: cid })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                  <Text variant="caption" color={here ? c.accentGlow : c.textMuted} style={{ width: 18 }}>{k + 1}</Text>
                  <Text variant="callout" color={here ? c.text : c.textDim} style={{ flex: 1 }}>{exerciseById.get(cid)?.name ?? cid}</Text>
                  {here ? <Pill label="You are here" color={c.accentGlow} /> : null}
                </PressableScale>
              );
            })}
          </Card>
        </Appear>
      ) : null}

      {alternatives.length ? (
        <Appear index={5} style={{ gap: spacing[3] }}>
          <SectionHeader title="Alternatives you can do" />
          <Card padded={false}>
            {alternatives.map((a, k) => (
              <PressableScale key={a.id} haptic="tap" onPress={() => router.setParams({ id: a.id })} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: k ? 1 : 0, borderColor: c.border }}>
                <Text variant="callout" style={{ flex: 1 }}>{a.name}</Text>
                <Icon name="chevron-forward" size={16} color={c.textMuted} />
              </PressableScale>
            ))}
          </Card>
        </Appear>
      ) : null}
    </Page>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text variant="callout" muted>{k}</Text>
      <Text variant="callout" style={{ flexShrink: 1, textAlign: 'right' }}>{v}</Text>
    </View>
  );
}
