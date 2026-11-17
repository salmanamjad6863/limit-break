import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, TextInput, View } from 'react-native';
import { canPerform } from '@lb/engine';
import { catalog, muscleLabel, patternLabel, useTrainingProfile } from '@/features/training';
import { useTheme } from '@/theme';
import { Icon, Page, PressableScale, ScreenHeader, Text } from '@/ui';

export default function ExerciseLibrary() {
  const { c, spacing, radius, type } = useTheme();
  const profile = useTrainingProfile();
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(true);
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = catalog.filter(
      (e) => (!mine || canPerform(e, profile)) && (!term || e.name.toLowerCase().includes(term) || e.pattern.includes(term)),
    );
    const map = new Map<string, typeof list>();
    for (const e of list) map.set(patternLabel(e.pattern), [...(map.get(patternLabel(e.pattern)) ?? []), e]);
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [q, mine, profile]);

  return (
    // virtualized: the library grows toward 250 exercises (PLAN.md), so rows mount only when visible
    <Page header={<ScreenHeader title="Exercise library" />} scroll={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing[3] }}>
        <Icon name="search" size={18} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search exercises"
          placeholderTextColor={c.textMuted}
          style={{ flex: 1, color: c.text, fontFamily: type.body.font, fontSize: 16, paddingVertical: spacing[3] }}
        />
      </View>
      <PressableScale haptic="tap" onPress={() => setMine((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: mine }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Icon name={mine ? 'checkbox' : 'square-outline'} size={20} color={mine ? c.accentGlow : c.textMuted} />
        <Text variant="callout" dim>Only what I can do with my equipment</Text>
      </PressableScale>
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
          <Text variant="label" dim style={{ marginTop: spacing[4], marginBottom: spacing[2] }}>{`${section.title} · ${section.data.length}`}</Text>
        )}
        renderItem={({ item: e, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <PressableScale haptic="tap" onPress={() => router.push(`/exercise/${e.id}`)} accessibilityRole="button" accessibilityLabel={e.name}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4],
                backgroundColor: c.surface, borderColor: c.border, borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: 1, borderBottomWidth: last ? 1 : 0,
                borderTopLeftRadius: first ? radius.lg : 0, borderTopRightRadius: first ? radius.lg : 0,
                borderBottomLeftRadius: last ? radius.lg : 0, borderBottomRightRadius: last ? radius.lg : 0,
              }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="callout">{e.name}</Text>
                <Text variant="caption" muted>{e.primary.map(muscleLabel).join(', ')}</Text>
              </View>
              <Icon name="chevron-forward" size={16} color={c.textMuted} />
            </PressableScale>
          );
        }}
        ListEmptyComponent={<Text dim style={{ marginTop: spacing[4] }}>No exercises match.</Text>}
      />
    </Page>
  );
}
