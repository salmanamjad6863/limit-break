import type { Meal } from '@lb/contracts';
import { useState } from 'react';
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
import { Button, Card, Page, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';
import { Segmented, TextField } from '@/ui/form';


/** Save a meal as a reusable template and apply it to any day (SYSTEMS.md §6.7). */
export default function MealTemplatesScreen() {
  const { c, spacing } = useTheme();
  const today = useGameDate();
  const { data: day } = useNutritionDay(today);
  const { data, isLoading } = useMealTemplates();
  const upsert = useUpsertMealTemplate();
  const del = useDeleteMealTemplate();
  const apply = useApplyMealTemplate();
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const logs = (day?.logs ?? []).filter((l) => l.meal === meal);
  const canSave = name.trim().length > 0 && logs.length > 0;

  return (
    <Page header={<ScreenHeader title="Meal templates" />}>
      <Card>
        <Text variant="callout" dim>Save today’s meal as a one-tap template. Applying is idempotent — tap twice and you still get one set of logs.</Text>
        <Segmented
          options={MEALS.map((m) => ({ value: m.id, label: m.label }))}
          value={meal}
          onChange={(v) => setMeal(v as Meal)}
        />
        <TextField label="Template name" placeholder={`e.g. ${MEALS.find((m) => m.id === meal)?.label} usual`} value={name} onChangeText={setName} />
        <Text variant="caption" muted>
          {logs.length ? `${logs.length} item${logs.length === 1 ? '' : 's'} from today’s ${MEALS.find((m) => m.id === meal)?.label?.toLowerCase()}` : 'Log food for this meal first, then save it.'}
        </Text>
        <Button
          size="md"
          icon="bookmark-outline"
          label="Save as template"
          disabled={!canSave}
          loading={upsert.isPending}
          onPress={() =>
            upsert.mutate(
              {
                id: newId(),
                name: name.trim(),
                meal,
                items: logs.map((l) => ({ foodId: l.food.id, grams: l.grams, servingLabel: l.servingLabel ?? null })),
              },
              { onSuccess: () => { setName(''); setMsg('Template saved.'); } },
            )
          }
        />
      </Card>

      <SectionHeader title="Your templates" />
      {isLoading ? <Text dim>Loading…</Text> : null}
      {!isLoading && !(data?.templates.length) ? <Text variant="caption" muted>No templates yet.</Text> : null}
      {(data?.templates ?? []).map((t) => (
        <Card key={t.id}>
          <Text variant="headline">{t.name}</Text>
          <Text variant="caption" muted>{`${t.meal} · ${t.items.length} item${t.items.length === 1 ? '' : 's'}`}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Button
                size="md"
                label="Apply to today"
                loading={apply.isPending}
                onPress={() =>
                  apply.mutate(
                    { id: t.id, toDate: today },
                    { onSuccess: (r) => setMsg(`Applied ${r.created} item(s).`) },
                  )
                }
              />
            </View>
            <PressableScale haptic="tap" onPress={() => del.mutate(t.id)} accessibilityRole="button" accessibilityLabel={`Delete ${t.name}`}
              style={{ paddingHorizontal: spacing[3], justifyContent: 'center' }}>
              <Text variant="caption" color={c.danger}>Delete</Text>
            </PressableScale>
          </View>
        </Card>
      ))}
      {msg ? <Text variant="caption" color={c.success}>{msg}</Text> : null}
      {apply.isError || upsert.isError ? <Text variant="caption" color={c.warning}>Something went wrong. Try again.</Text> : null}
    </Page>
  );
}
