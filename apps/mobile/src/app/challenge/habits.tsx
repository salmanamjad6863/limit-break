import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { HABIT_LIBRARY, useChallengeDraft, type HabitIdea } from '@/features/challenges';
import { useTheme } from '@/theme';
import { Difficulty, type IconName, Page, PressableScale, SceneCard, ScreenHeader, Text } from '@/ui';
import { CHALLENGE_LIMITS } from '@lb/engine';

const CATS = ['All', 'Body', 'Fuel', 'Mind', 'Routine'] as const;

/** Habit library for the challenge builder: illustrated cards with difficulty; tap to add, tap again to remove. */
export default function HabitLibrary() {
  const { c, spacing, radius } = useTheme();
  const draft = useChallengeDraft((s) => s.draft);
  const update = useChallengeDraft((s) => s.update);
  const [cat, setCat] = useState<(typeof CATS)[number]>('All');
  const added = new Set(draft?.tasks.filter((t) => t.kind === 'habit').map((t) => t.title) ?? []);
  const full = (draft?.tasks.length ?? 0) >= CHALLENGE_LIMITS.tasks;
  const list = HABIT_LIBRARY.filter((h) => cat === 'All' || h.category === cat);

  const toggle = (h: HabitIdea) =>
    update((d) => {
      if (d.tasks.some((t) => t.kind === 'habit' && t.title === h.title)) return { ...d, tasks: d.tasks.filter((t) => !(t.kind === 'habit' && t.title === h.title)) };
      if (d.tasks.length >= CHALLENGE_LIMITS.tasks) return d;
      let i = 1;
      while (d.tasks.some((t) => t.id === `t${i}`)) i++;
      return { ...d, tasks: [...d.tasks, { id: `t${i}`, kind: 'habit', title: h.title }] };
    });
  const custom = () => {
    update((d) => {
      let i = 1;
      while (d.tasks.some((t) => t.id === `t${i}`)) i++;
      return d.tasks.length >= CHALLENGE_LIMITS.tasks ? d : { ...d, tasks: [...d.tasks, { id: `t${i}`, kind: 'habit', title: '' }] };
    });
    router.back();
  };

  if (!draft) {
    return (
      <Page header={<ScreenHeader title="Add daily habits" icon="close" />}>
        <Text dim>Start a challenge first, then add habits to it.</Text>
      </Page>
    );
  }
  return (
    <Page header={<ScreenHeader title="Add daily habits" icon="close" />}>
      <Text variant="caption" muted>{`${HABIT_LIBRARY.length} habits · ${added.size} added${full ? ` · a challenge holds up to ${CHALLENGE_LIMITS.tasks} tasks` : ''}`}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {CATS.map((k) => (
          <PressableScale key={k} haptic="tap" onPress={() => setCat(k)} accessibilityRole="tab" accessibilityState={{ selected: cat === k }}
            style={{ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: cat === k ? c.accent : c.border, backgroundColor: cat === k ? `${c.accent}1F` : 'transparent' }}>
            <Text variant="caption" color={cat === k ? c.text : c.textDim}>{k}</Text>
          </PressableScale>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing[1] }}>
        <View style={{ width: '50%', padding: spacing[1] }}>
          <SceneCard title="Write your own" subtitle="Any daily habit" icon="create" colors={['#3B3355', '#121019']} onPress={custom} />
        </View>
        {list.map((h) => {
          const on = added.has(h.title);
          return (
            <View key={h.title} style={{ width: '50%', padding: spacing[1] }}>
              <SceneCard title={h.title} icon={h.icon as IconName} colors={h.colors} selected={on} onPress={() => toggle(h)}
                accessibilityLabel={`${h.title}, ${['easy', 'medium', 'hard'][h.difficulty - 1]}${on ? ', added' : ''}`}
                footer={<Difficulty level={h.difficulty} />}>
                {on ? (
                  <View style={{ position: 'absolute', top: spacing[2], right: spacing[2], width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent }}>
                    <Text variant="caption" color="#FFFFFF" style={{ fontFamily: 'Inter_700Bold' }}>✓</Text>
                  </View>
                ) : null}
              </SceneCard>
            </View>
          );
        })}
      </View>
    </Page>
  );
}
