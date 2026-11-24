import { canPerform, ROUTINE_LIMITS } from '@lb/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, TextInput, View } from 'react-native';
import { catalog, defaultSlot, muscleLabel, patternLabel, useRoutineDraft, useTrainingProfile } from '@/features/training';
import { useTheme } from '@/theme';
import { Button, Icon, Page, PressableScale, ScreenHeader, Text } from '@/ui';

/** Add exercises to one day of the routine being edited. Tap to add, tap again to remove. */
export default function PickExercises() {
  const { c, spacing, radius, type } = useTheme();
  const { day } = useLocalSearchParams<{ day: string }>();
  const profile = useTrainingProfile();
  const draft = useRoutineDraft((s) => s.draft);
  const update = useRoutineDraft((s) => s.update);
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const target = draft?.days.find((d) => d.id === day) ?? null;
  const inDay = new Set(target?.slots.map((s) => s.exerciseId) ?? []);
  const full = (target?.slots.length ?? 0) >= ROUTINE_LIMITS.slots;

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = catalog.filter(
      (e) => (!mine || canPerform(e, profile)) &&
        (!term || e.name.toLowerCase().includes(term) || patternLabel(e.pattern).toLowerCase().includes(term) || e.primary.some((m) => m.includes(term))),
    );
    const map = new Map<string, typeof list>();
    for (const e of list) map.set(patternLabel(e.pattern), [...(map.get(patternLabel(e.pattern)) ?? []), e]);
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [q, mine, profile]);

  const toggle = (exerciseId: string) =>
    update((r) => ({
      ...r,
      days: r.days.map((d) => {
        if (d.id !== day) return d;
        if (d.slots.some((s) => s.exerciseId === exerciseId)) return { ...d, slots: d.slots.filter((s) => s.exerciseId !== exerciseId) };
        if (d.slots.length >= ROUTINE_LIMITS.slots) return d;
        return { ...d, slots: [...d.slots, defaultSlot(exerciseId)] };
      }),
    }));

  if (!target) {
    return (
      <Page header={<ScreenHeader title="Add exercises" icon="close" />}>
        <Text dim>This day is no longer in the routine.</Text>
      </Page>
    );
  }

  return (
    <Page header={<ScreenHeader title={`Add to ${target.name}`} icon="close" />} scroll={false}
      footer={<Button label={target.slots.length ? `Done · ${target.slots.length} exercise${target.slots.length === 1 ? '' : 's'}` : 'Done'} icon="checkmark" onPress={() => router.back()} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing[3] }}>
        <Icon name="search" size={18} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search by name or muscle" placeholderTextColor={c.textMuted} autoCorrect={false}
          style={{ flex: 1, color: c.text, fontFamily: type.body.font, fontSize: 16, paddingVertical: spacing[3] }} />
      </View>
      <PressableScale haptic="tap" onPress={() => setMine((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: mine }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Icon name={mine ? 'checkbox' : 'square-outline'} size={20} color={mine ? c.accentGlow : c.textMuted} />
        <Text variant="callout" dim>Only what my equipment allows</Text>
      </PressableScale>
      {full ? <Text variant="caption" color={c.warning}>{`A day holds up to ${ROUTINE_LIMITS.slots} exercises.`}</Text> : null}
      <SectionList
        sections={groups}
        keyExtractor={(e) => e.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing[8] }}
        stickySectionHeadersEnabled={false}
        initialNumToRender={14}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => (
          <Text variant="label" dim style={{ marginTop: spacing[4], marginBottom: spacing[2] }}>{section.title}</Text>
        )}
        renderItem={({ item: e }) => {
          const on = inDay.has(e.id);
          return (
            <PressableScale haptic="tap" onPress={() => toggle(e.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: full && !on }}
              accessibilityLabel={e.name} disabled={full && !on}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], marginBottom: 6, borderRadius: radius.md,
                borderWidth: 1, borderColor: on ? c.accent : c.border, backgroundColor: on ? `${c.accent}1F` : c.surface }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="callout">{e.name}</Text>
                <Text variant="caption" muted>{e.primary.map(muscleLabel).join(', ')}{e.equipment.length ? ` · ${e.equipment.map(muscleLabel).join(', ')}` : ''}</Text>
              </View>
              <Icon name={on ? 'checkmark-circle' : 'add-circle-outline'} size={22} color={on ? c.accentGlow : c.textMuted} />
            </PressableScale>
          );
        }}
        ListEmptyComponent={<Text dim style={{ marginTop: spacing[4] }}>No exercises match.</Text>}
      />
    </Page>
  );
}
