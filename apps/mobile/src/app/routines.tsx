import { routineIdOf, routineWeekNames } from '@lb/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import {
  blankDay, newId, programs, routineFromProgram, usePersonalContext, useRoutineDraft, useRoutines, useToday, useTraining,
} from '@/features/training';
import { useTheme } from '@/theme';
import { Appear, Button, Card, Icon, Page, Pill, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';

const WEEK = [1, 2, 3, 4, 5, 6, 0];
const LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The hunter's own weekly routines: build from scratch or start from a built-in program. */
export default function RoutinesScreen() {
  const { c, spacing, radius } = useTheme();
  const routines = useRoutines();
  const activeId = routineIdOf(useTraining((s) => s.activeProgramId));
  const begin = useRoutineDraft((s) => s.begin);
  const ctx = usePersonalContext();
  const today = useToday();
  const [copying, setCopying] = useState(false);

  const create = () => {
    const id = newId();
    begin({ id, name: '', days: [blankDay('Day A', [])], schedule: {}, updatedAt: new Date().toISOString() });
    router.push(`/routine/${id}`);
  };

  return (
    <Page header={<ScreenHeader title="My routines" />} footer={<Button label="New routine" icon="add" onPress={create} />}>
      <Text variant="callout" dim>
        Your own week: pick the exercises, sets and reps for each day and the weekdays you train. Weights, warm-ups, PRs and XP work like any program.
      </Text>

      {routines.length ? (
        routines.map((r, i) => {
          const names = routineWeekNames(r);
          const active = activeId === r.id;
          return (
            <Appear key={r.id} index={i}>
              <PressableScale haptic="press" accessibilityRole="button" accessibilityLabel={`${r.name}${active ? ', active' : ''}`} onPress={() => router.push(`/routine/${r.id}`)}>
                <Card tint={active ? c.accent : undefined} style={active ? { borderColor: `${c.accent}80` } : undefined}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                    <Text variant="headline" style={{ flex: 1 }} numberOfLines={1}>{r.name}</Text>
                    {active ? <Pill icon="checkmark-circle" label="Active" color={c.success} /> : null}
                  </View>
                  <Text variant="caption" muted>{r.days.map((d) => `${d.name} · ${d.slots.length} ex`).join('   ')}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {WEEK.map((wd) => (
                      <View key={wd} accessibilityLabel={names[wd] ?? 'Rest'}
                        style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.sm, backgroundColor: names[wd] ? `${c.accent}26` : c.surfaceRaised }}>
                        <Text variant="micro" color={names[wd] ? c.text : c.textMuted}>{LETTER[wd]}</Text>
                        <Text variant="micro" color={names[wd] ? c.accentGlow : c.textMuted} numberOfLines={1}>{names[wd]?.slice(0, 5) ?? '–'}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              </PressableScale>
            </Appear>
          );
        })
      ) : (
        <Card>
          <Icon name="construct-outline" size={24} color={c.accentGlow} />
          <Text variant="headline">No routines yet</Text>
          <Text variant="callout" dim>Start empty, or copy a program below and change what you like.</Text>
        </Card>
      )}

      <SectionHeader title="Start from a program" action={copying ? 'Hide' : 'Show'} onAction={() => setCopying((v) => !v)} />
      {copying
        ? programs.map((p) => (
            <PressableScale key={p.id} haptic="tap" accessibilityRole="button" accessibilityLabel={`Copy ${p.name}`}
              onPress={() => {
                const r = routineFromProgram(p, ctx, today.weekdays);
                begin(r);
                router.push(`/routine/${r.id}`);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
              <View style={{ flex: 1 }}>
                <Text variant="callout">{p.name}</Text>
                <Text variant="caption" muted numberOfLines={1}>{p.days.map((d) => d.name).join(' · ')}</Text>
              </View>
              <Icon name="copy-outline" size={18} color={c.accentGlow} />
            </PressableScale>
          ))
        : <Text variant="caption" muted>The copy uses the exercises you’d get at your level, on your training days.</Text>}
    </Page>
  );
}
