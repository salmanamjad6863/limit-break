import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { canPerform } from '@lb/engine';
import { catalog, muscleLabel, patternLabel, useTrainingProfile } from '@/features/training';
import { useTheme } from '@/theme';
import { Card, Icon, Page, PressableScale, ScreenHeader, Text } from '@/ui';

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
    return [...map.entries()];
  }, [q, mine, profile]);

  return (
    <Page header={<ScreenHeader title="Exercise library" />}>
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
      {groups.map(([label, list]) => (
        <View key={label} style={{ gap: spacing[2] }}>
          <Text variant="label" dim>{`${label} · ${list.length}`}</Text>
          <Card padded={false}>
            {list.map((e, k) => (
              <PressableScale key={e.id} haptic="tap" onPress={() => router.push(`/exercise/${e.id}`)} accessibilityRole="button" accessibilityLabel={e.name}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: k ? 1 : 0, borderColor: c.border }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="callout">{e.name}</Text>
                  <Text variant="caption" muted>{e.primary.map(muscleLabel).join(', ')}</Text>
                </View>
                <Icon name="chevron-forward" size={16} color={c.textMuted} />
              </PressableScale>
            ))}
          </Card>
        </View>
      ))}
    </Page>
  );
}
