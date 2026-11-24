import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, TextInput, View } from 'react-native';
import { useChallengeDraft } from '@/features/challenges';
import { catalog, muscleLabel, patternLabel } from '@/features/training';
import { useTheme } from '@/theme';
import { Icon, Page, PressableScale, ScreenHeader, Text } from '@/ui';

/** Pick one exercise for a challenge task; timed exercises start in seconds. */
export default function PickChallengeExercise() {
  const { c, spacing, radius, type } = useTheme();
  const update = useChallengeDraft((s) => s.update);
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = catalog.filter((e) => !term || e.name.toLowerCase().includes(term) || e.primary.some((m) => m.includes(term)));
    const map = new Map<string, typeof list>();
    for (const e of list) map.set(patternLabel(e.pattern), [...(map.get(patternLabel(e.pattern)) ?? []), e]);
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [q]);

  const pick = (exerciseId: string, timed: boolean) => {
    update((d) => {
      let i = 1;
      while (d.tasks.some((t) => t.id === `t${i}`)) i++;
      return { ...d, tasks: [...d.tasks, { id: `t${i}`, kind: 'exercise', exerciseId, title: '', target: timed ? 30 : 10, unit: timed ? 'sec' : 'reps', addPerStep: 0, stepDays: 1 }] };
    });
    router.back();
  };

  return (
    <Page header={<ScreenHeader title="Choose an exercise" icon="close" />} scroll={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing[3] }}>
        <Icon name="search" size={18} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search by name or muscle" placeholderTextColor={c.textMuted} autoCorrect={false}
          style={{ flex: 1, color: c.text, fontFamily: type.body.font, fontSize: 16, paddingVertical: spacing[3] }} />
      </View>
      <SectionList
        sections={groups}
        keyExtractor={(e) => e.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing[8] }}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => <Text variant="label" dim style={{ marginTop: spacing[4], marginBottom: spacing[2] }}>{section.title}</Text>}
        renderItem={({ item: e }) => (
          <PressableScale haptic="tap" onPress={() => pick(e.id, e.kind === 'time')} accessibilityRole="button" accessibilityLabel={e.name}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], marginBottom: 6, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="callout">{e.name}</Text>
              <Text variant="caption" muted>{e.primary.map(muscleLabel).join(', ')}{e.kind === 'time' ? ' · timed' : ''}</Text>
            </View>
            <Icon name="add-circle-outline" size={22} color={c.textMuted} />
          </PressableScale>
        )}
        ListEmptyComponent={<Text dim style={{ marginTop: spacing[4] }}>No exercises match.</Text>}
      />
    </Page>
  );
}
