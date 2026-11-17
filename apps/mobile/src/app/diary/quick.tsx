import type { FoodDto } from '@lb/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { MEALS, useFoodDraft, useNutritionActions } from '@/features/nutrition';
import { newId } from '@/lib/id';
import { useTheme } from '@/theme';
import { Button, Card, Page, ScreenHeader, Text } from '@/ui';
import { TextField } from '@/ui/form';

const n = (s: string) => Math.max(0, Number(s.replace(',', '.')) || 0);

/** Quick add: calories and macros straight in, when you know the numbers (restaurant label, coach plan). */
export default function QuickAdd() {
  const { c } = useTheme();
  const d = useFoodDraft();
  const { addLog } = useNutritionActions();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const fromMacros = 4 * n(p) + 4 * n(carbs) + 9 * n(fat);
  const k = n(kcal) || Math.round(fromMacros);
  const mismatch = n(kcal) > 0 && fromMacros > 0 && Math.abs(n(kcal) - fromMacros) / n(kcal) > 0.15;
  const valid = k > 0 && k <= 5000 && n(p) <= 400 && n(carbs) <= 800 && n(fat) <= 400;

  const save = () => {
    // one entry = 100 "g", so per100 holds the entry's own numbers
    const food: FoodDto = {
      id: `quick:${newId()}`, name: name.trim() || 'Quick add', per100: { kcal: Math.min(902, k), protein: Math.min(100, n(p)), carbs: Math.min(100, n(carbs)), fat: Math.min(100, n(fat)) },
      servings: [{ label: '1 entry', grams: 100 }], source: 'quick', verified: false, brand: null, barcode: null,
    };
    addLog.mutate({ food, grams: 100, meal: d.meal, servingLabel: 'Quick add', localDate: d.date }, { onSuccess: () => router.dismissTo('/nutrition') });
  };

  return (
    <Page accent={c.mana} header={<ScreenHeader title={`Quick add · ${MEALS.find((m) => m.id === d.meal)?.label ?? ''}`} />}
      footer={<Button label="Add" icon="checkmark" disabled={!valid} loading={addLog.isPending} onPress={save} />}>
      <TextField label="Name (optional)" placeholder="e.g. Restaurant burger" value={name} onChangeText={setName} />
      <TextField label="Calories (kcal)" placeholder={fromMacros ? `${Math.round(fromMacros)} from macros` : '0'} value={kcal} onChangeText={setKcal} keyboardType="number-pad" />
      <TextField label="Protein (g)" value={p} onChangeText={setP} keyboardType="decimal-pad" />
      <TextField label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" />
      <TextField label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
      {mismatch ? (
        <Card tint={c.warning}>
          <Text variant="callout">{`Macros add up to ${Math.round(fromMacros)} kcal, not ${n(kcal)}.`}</Text>
          <Text variant="caption" muted>Double-check the label (alcohol and fiber explain small gaps).</Text>
        </Card>
      ) : null}
      {k > 900 ? <Text variant="caption" muted>Quick-add entries above 900 kcal are capped. Split a big meal into two entries.</Text> : null}
    </Page>
  );
}
