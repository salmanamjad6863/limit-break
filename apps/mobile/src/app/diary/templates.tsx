import { curatedFoodById } from '@lb/content';
import type { Meal } from '@lb/contracts';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  useApplyMealTemplate,
  useDeleteMealTemplate,
  useMealTemplates,
  useUpsertMealTemplate,
} from '@/features/depth';
import { MEALS, useGameDate, useNutritionDay } from '@/features/nutrition';
import { newId } from '@/lib/id';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';
import { TextField } from '@/ui/form';

/** Save a meal as a reusable template and add it to today in one tap (SYSTEMS.md §6.7). */
export default function MealTemplatesScreen() {
  const { c, spacing, radius } = useTheme();
  const today = useGameDate();
  const { data: day } = useNutritionDay(today);
  const { data, isLoading } = useMealTemplates();
  const upsert = useUpsertMealTemplate();
  const del = useDeleteMealTemplate();
  const apply = useApplyMealTemplate();
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [applied, setApplied] = useState<Record<string, number>>({});
  const [applying, setApplying] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const logs = (day?.logs ?? []).filter((l) => l.meal === meal);
  const canSave = name.trim().length > 0 && logs.length > 0;
  const mealLabel = (m: string) => MEALS.find((x) => x.id === m)?.label ?? m;
  // templates store food ids: names come from the curated list and foods you've logged
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of day?.logs ?? []) m.set(l.food.id, l.food.name);
    return (id: string) => m.get(id) ?? curatedFoodById.get(id)?.name ?? null;
  }, [day?.logs]);

  return (
    <Page accent={c.mana} header={<ScreenHeader title="Meal templates" />}>
      <Card>
        <Text variant="headline">Save a meal</Text>
        <Text variant="caption" muted>Save what you ate today as a template, then add the whole meal again in one tap.</Text>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {MEALS.map((m) => {
            const on = meal === m.id;
            return (
              <PressableScale key={m.id} haptic="tap" onPress={() => { setMeal(m.id); setSaved(false); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={m.label}
                style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing[2], borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? c.mana : c.border, backgroundColor: on ? `${c.mana}1F` : c.surfaceRaised }}>
                <Icon name={m.icon} size={16} color={on ? c.mana : c.textMuted} />
                <Text variant="caption" color={on ? c.text : c.textDim}>{m.label}</Text>
              </PressableScale>
            );
          })}
        </View>
        {logs.length ? (
          <View style={{ gap: 4 }}>
            {logs.map((l) => (
              <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="checkmark-circle" size={14} color={c.mana} />
                <Text variant="caption" dim numberOfLines={1} style={{ flex: 1 }}>{`${l.food.name} · ${Math.round(l.grams)} g`}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text variant="caption" color={c.warning}>{`Nothing logged for ${mealLabel(meal).toLowerCase()} today. Log it first, then save it here.`}</Text>
        )}
        <TextField label="Template name" placeholder={`e.g. My usual ${mealLabel(meal).toLowerCase()}`} value={name} onChangeText={(t) => { setName(t); setSaved(false); }} />
        <Button size="md" icon="bookmark-outline" label={saved ? 'Saved' : 'Save as template'} disabled={!canSave || saved} loading={upsert.isPending}
          onPress={() => upsert.mutate(
            { id: newId(), name: name.trim(), meal, items: logs.map((l) => ({ foodId: l.food.id, grams: l.grams, servingLabel: l.servingLabel ?? null })) },
            { onSuccess: () => { setName(''); setSaved(true); } },
          )} />
        {upsert.isError ? <Text variant="caption" color={c.warning}>Couldn’t save the template. Try again.</Text> : null}
      </Card>

      <SectionHeader title="Your templates" />
      {isLoading ? <Text dim>Loading…</Text> : null}
      {!isLoading && !(data?.templates.length) ? (
        <Card>
          <Icon name="bookmark-outline" size={22} color={c.textMuted} />
          <Text variant="callout" dim>No templates yet. Save a meal you eat often, like your usual breakfast.</Text>
        </Card>
      ) : null}
      {(data?.templates ?? []).map((t) => {
        const known = t.items.map((i) => names(i.foodId)).filter((x): x is string => !!x);
        const done = applied[t.id];
        return (
          <Card key={t.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${c.mana}1A` }}>
                <Icon name={MEALS.find((m) => m.id === t.meal)?.icon ?? 'restaurant-outline'} size={18} color={c.mana} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="headline" numberOfLines={1}>{t.name}</Text>
                <Text variant="caption" muted>{`${mealLabel(t.meal)} · ${t.items.length} ${t.items.length === 1 ? 'item' : 'items'}`}</Text>
              </View>
              <PressableScale haptic="tap" onPress={() => (confirmDelete === t.id ? (del.mutate(t.id), setConfirmDelete(null)) : setConfirmDelete(t.id))}
                accessibilityRole="button" accessibilityLabel={confirmDelete === t.id ? `Confirm delete ${t.name}` : `Delete ${t.name}`}
                style={{ paddingHorizontal: 10, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: confirmDelete === t.id ? `${c.danger}22` : 'transparent' }}>
                {confirmDelete === t.id ? <Text variant="caption" color={c.danger}>Delete?</Text> : <Icon name="trash-outline" size={16} color={c.textMuted} />}
              </PressableScale>
            </View>
            {known.length ? <Text variant="caption" dim numberOfLines={2}>{known.join(' · ')}</Text> : null}
            <Button size="md" variant={done != null ? 'secondary' : 'primary'} icon={done != null ? 'checkmark-circle' : 'add-circle-outline'}
              label={done != null ? `Added to today (${done} ${done === 1 ? 'item' : 'items'})` : 'Add to today'}
              disabled={applying != null || done != null} loading={applying === t.id}
              // one id per tap: a retried request reuses it, so the meal is never added twice
              onPress={() => {
                setApplying(t.id);
                apply.mutate({ id: t.id, toDate: today, applyId: newId() }, {
                  onSuccess: (r) => setApplied((a) => ({ ...a, [t.id]: r.created })),
                  onSettled: () => setApplying(null),
                });
              }} />
          </Card>
        );
      })}
      {apply.isError ? <Text variant="caption" color={c.warning}>Couldn’t add the template. Try again.</Text> : null}
    </Page>
  );
}
