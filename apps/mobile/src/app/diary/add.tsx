import type { FoodDto, Meal } from '@lb/contracts';
import { dataColors } from '@lb/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { MEALS, useFoodDraft, useFoodSearch, useGameDate } from '@/features/nutrition';
import { useTheme } from '@/theme';
import { Card, Icon, Page, PressableScale, ScreenHeader, Text } from '@/ui';
import { TextField } from '@/ui/form';

/** Add food: search (curated + yours, ranked by your history), barcode, quick add, custom food. */
export default function AddFood() {
  const { c, spacing, radius } = useTheme();
  const params = useLocalSearchParams<{ meal?: Meal; date?: string }>();
  const today = useGameDate();
  const draft = useFoodDraft();
  const meal = params.meal ?? draft.meal;
  const date = params.date ?? (draft.date || today);
  const [q, setQ] = useState('');
  const { foods, isLoading } = useFoodSearch(q);
  const mealLabel = MEALS.find((m) => m.id === meal)?.label ?? 'Food';

  const pick = (food: FoodDto) => {
    draft.set({ food, meal, date, logId: null, grams: null, servingLabel: null });
    router.push('/diary/portion');
  };
  const actions = [
    { icon: 'barcode-outline' as const, label: 'Scan', go: () => { draft.set({ meal, date }); router.push('/diary/scan'); } },
    { icon: 'flash-outline' as const, label: 'Quick add', go: () => { draft.set({ meal, date }); router.push('/diary/quick'); } },
    { icon: 'create-outline' as const, label: 'New food', go: () => { draft.set({ meal, date }); router.push('/diary/create'); } },
  ];

  return (
    <Page accent={c.mana} header={<ScreenHeader title={`Add to ${mealLabel}`} icon="close" />}>
      <TextField label="Search foods" placeholder="e.g. chicken, rice, roti, oats" value={q} onChangeText={setQ} autoFocus autoCorrect={false} returnKeyType="search" accessibilityLabel="Search foods" />
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        {actions.map((a) => (
          <PressableScale key={a.label} haptic="tap" onPress={a.go} accessibilityRole="button" accessibilityLabel={a.label}
            style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing[3], borderRadius: radius.md, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border }}>
            <Icon name={a.icon} size={20} color={c.mana} />
            <Text variant="caption">{a.label}</Text>
          </PressableScale>
        ))}
      </View>
      <Text variant="label" muted>{q.trim() ? 'Results' : foods.length ? 'Your frequent foods' : 'Start typing to search'}</Text>
      {isLoading ? <Text dim>Searching…</Text> : null}
      {q.trim() && !isLoading && foods.length === 0 ? (
        <Card>
          <Text variant="callout">{`No match for “${q.trim()}”.`}</Text>
          <Text variant="caption" muted>Scan its barcode, use Quick add, or create it once and it’s yours forever.</Text>
        </Card>
      ) : null}
      {foods.length ? (
        <Card padded={false}>
          {foods.map((f, i) => {
            const s = f.servings[0];
            const per = s ? s.grams / 100 : 1;
            return (
              <PressableScale key={f.id} haptic="tap" onPress={() => pick(f)} accessibilityRole="button" accessibilityLabel={f.name}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="callout" numberOfLines={1}>{f.name}</Text>
                    <Text variant="caption" muted numberOfLines={1}>
                      {`${s ? s.label : '100 g'} · ${Math.round(f.per100.kcal * per)} kcal${f.brand ? ` · ${f.brand}` : ''}${f.source === 'recipe' ? ' · home-cooked' : ''}`}
                    </Text>
                  </View>
                  <Text variant="caption" color={dataColors.protein}>{`${Math.round(f.per100.protein * per)} g P`}</Text>
                  <Icon name="add-circle" size={22} color={c.mana} />
                </View>
              </PressableScale>
            );
          })}
        </Card>
      ) : null}
    </Page>
  );
}
