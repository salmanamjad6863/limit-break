import { labelLooksOff, nutrientsForGrams } from '@lb/engine';
import { dataColors } from '@lb/tokens';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { MEALS, useFoodDraft, useNutritionActions } from '@/features/nutrition';
import { useTheme } from '@/theme';
import { Button, Card, Page, Pill, PressableScale, ScreenHeader, Text } from '@/ui';
import { Segmented, TextField } from '@/ui/form';

const QTY = [0.5, 1, 1.5, 2, 3];

/** Portion picker: household servings or grams, live macros, meal; add or edit (SYSTEMS.md §2.7). */
export default function Portion() {
  const { c, spacing, radius } = useTheme();
  const d = useFoodDraft();
  const { addLog, patchLog, deleteLog } = useNutritionActions();
  const food = d.food;
  const servings = food?.servings ?? [];
  // saved labels look like "1.5 × 1/2 cup": match the base serving so edits reopen on it
  const initialServing = servings.find((s) => d.servingLabel === s.label || d.servingLabel?.endsWith(` × ${s.label}`)) ?? (d.grams == null ? servings[0] : undefined);
  const [unit, setUnit] = useState<string>(initialServing ? initialServing.label : 'g');
  const [qty, setQty] = useState<number>(initialServing && d.grams ? Math.round((d.grams / initialServing.grams) * 100) / 100 : 1);
  const [gramsText, setGramsText] = useState(String(Math.round(d.grams ?? 100)));
  const [meal, setMeal] = useState(d.meal);
  if (!food) return <Redirect href="/nutrition" />;

  const serving = servings.find((s) => s.label === unit);
  const grams = serving ? serving.grams * qty : Math.max(0, Number(gramsText.replace(',', '.')) || 0);
  const n = nutrientsForGrams(food.per100, grams);
  const servingLabel = serving ? `${qty === 1 ? '' : `${qty} × `}${serving.label}` : null;
  const saving = addLog.isPending || patchLog.isPending;

  const save = () => {
    if (grams <= 0) return;
    const done = () => router.dismissTo('/nutrition');
    if (d.logId) patchLog.mutate({ id: d.logId, patch: { grams, meal, servingLabel } }, { onSuccess: done });
    else addLog.mutate({ food, grams, meal, servingLabel, localDate: d.date }, { onSuccess: done });
  };

  return (
    <Page accent={c.mana} header={<ScreenHeader title={d.logId ? 'Edit food' : 'Portion'} />}
      footer={<Button label={d.logId ? 'Save changes' : 'Add to diary'} icon="checkmark" loading={saving} disabled={grams <= 0} onPress={save} />}>
      <View style={{ gap: 4 }}>
        <Text variant="title">{food.name}</Text>
        <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
          {food.brand ? <Pill label={food.brand} /> : null}
          <Pill label={food.source === 'usda' ? 'USDA' : food.source === 'recipe' ? 'Home-cooked recipe' : food.source === 'off' ? 'Open Food Facts' : food.source === 'quick' ? 'Quick add' : 'Your food'} color={food.verified ? c.success : c.textDim} />
          {labelLooksOff(food.per100) ? <Pill icon="warning-outline" label="Label looks off" color={c.warning} /> : null}
        </View>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {[
            { k: 'kcal', v: Math.round(n.kcal), color: dataColors.calories },
            { k: 'Protein', v: `${Math.round(n.protein)} g`, color: dataColors.protein },
            { k: 'Carbs', v: `${Math.round(n.carbs)} g`, color: dataColors.carbs },
            { k: 'Fat', v: `${Math.round(n.fat)} g`, color: dataColors.fat },
          ].map((x) => (
            <View key={x.k} style={{ alignItems: 'center', gap: 2, flex: 1 }}>
              <Text variant="stat" style={{ fontSize: 24, lineHeight: 28 }} color={x.color}>{String(x.v)}</Text>
              <Text variant="caption" muted>{x.k}</Text>
            </View>
          ))}
        </View>
        <Text variant="caption" muted style={{ textAlign: 'center' }}>{`${Math.round(grams)} g${n.fiber ? ` · ${Math.round(n.fiber)} g fiber` : ''}`}</Text>
      </Card>

      <Text variant="label" muted>Serving</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {[...servings.map((s) => s.label), 'g'].map((u) => {
          const on = unit === u;
          return (
            <PressableScale key={u} haptic="tap" onPress={() => setUnit(u)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={u === 'g' ? 'Grams' : u}
              style={{ paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? c.mana : c.border, backgroundColor: on ? `${c.mana}1F` : c.surfaceRaised }}>
              <Text variant="callout" color={on ? c.text : c.textDim}>{u === 'g' ? 'Grams' : u}</Text>
            </PressableScale>
          );
        })}
      </View>
      {serving ? (
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {QTY.map((x) => {
            const on = qty === x;
            return (
              <PressableScale key={x} haptic="tap" onPress={() => setQty(x)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${x} servings`}
                style={{ flex: 1, alignItems: 'center', paddingVertical: spacing[3], borderRadius: radius.md, backgroundColor: on ? c.mana : c.surfaceRaised }}>
                <Text variant="headline" color={on ? '#FFFFFF' : c.text}>{`${x}×`}</Text>
              </PressableScale>
            );
          })}
        </View>
      ) : (
        <TextField label="Grams" value={gramsText} onChangeText={setGramsText} keyboardType="decimal-pad" selectTextOnFocus accessibilityLabel="Grams" />
      )}

      <Text variant="label" muted>Meal</Text>
      <Segmented options={MEALS.map((m) => ({ value: m.id, label: m.label }))} value={meal} onChange={setMeal} />

      {d.logId ? (
        <Button variant="ghost" size="md" icon="trash-outline" label="Remove from diary" loading={deleteLog.isPending}
          onPress={() => deleteLog.mutate(d.logId!, { onSuccess: () => router.dismissTo('/nutrition') })} />
      ) : null}
      {food.source === 'off' ? <Text variant="micro" muted>Product data © Open Food Facts contributors (ODbL).</Text> : null}
    </Page>
  );
}
