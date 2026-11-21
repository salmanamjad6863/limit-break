import type { FoodDto } from '@lb/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useFoodDraft, useNutritionActions } from '@/features/nutrition';
import { newId } from '@/lib/id';
import { useTheme } from '@/theme';
import { Button, Page, ScreenHeader, Text } from '@/ui';
import { TextField } from '@/ui/form';

const n = (s: string) => Math.max(0, Number(s.replace(',', '.')) || 0);

/** Your own food from its label (per serving). Saved privately and searchable from then on. */
export default function CreateFood() {
  const { c } = useTheme();
  const d = useFoodDraft();
  const { createFood } = useNutritionActions();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [servingLabel, setServingLabel] = useState('1 serving');
  const [servingG, setServingG] = useState('100');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  // lock the button the moment we stamp an id so a double-tap can't create twice
  const [locked, setLocked] = useState(false);
  const g = n(servingG);
  const per = (v: string) => Math.round((n(v) / g) * 100 * 10) / 10;
  const valid = name.trim().length >= 2 && g > 0 && g <= 2000 && n(kcal) > 0 && per(kcal) <= 902 && per(p) <= 100 && per(carbs) <= 100 && per(fat) <= 100;

  const save = () => {
    if (locked || !valid) return;
    setLocked(true);
    const food: FoodDto = {
      id: `custom:${newId()}`, name: name.trim(), brand: brand.trim() || null, barcode: null, source: 'custom', verified: false,
      per100: { kcal: per(kcal), protein: per(p), carbs: per(carbs), fat: per(fat), ...(fiber ? { fiber: per(fiber) } : {}) },
      servings: [{ label: servingLabel.trim() || '1 serving', grams: g }, ...(g !== 100 ? [{ label: '100 g', grams: 100 }] : [])],
    };
    // save in the background; portion screen uses the stamped food right away
    createFood.mutate(food);
    d.set({ food, logId: null, grams: null, servingLabel: null });
    router.replace('/diary/portion');
  };

  return (
    <Page accent={c.mana} header={<ScreenHeader title="New food" />}
      footer={<Button label="Save food" icon="checkmark" disabled={!valid || locked} loading={createFood.isPending || locked} onPress={save} />}>
      <Text variant="caption" muted>Copy the numbers from the label, per serving. Only you can see your foods.</Text>
      <TextField label="Name" placeholder="e.g. Mum’s chicken pulao" value={name} onChangeText={setName} />
      <TextField label="Brand (optional)" value={brand} onChangeText={setBrand} />
      <TextField label="Serving name" value={servingLabel} onChangeText={setServingLabel} />
      <TextField label="Serving size (g)" value={servingG} onChangeText={setServingG} keyboardType="decimal-pad" />
      <TextField label="Calories per serving (kcal)" value={kcal} onChangeText={setKcal} keyboardType="decimal-pad" />
      <TextField label="Protein per serving (g)" value={p} onChangeText={setP} keyboardType="decimal-pad" />
      <TextField label="Carbs per serving (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" />
      <TextField label="Fat per serving (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
      <TextField label="Fiber per serving (g, optional)" value={fiber} onChangeText={setFiber} keyboardType="decimal-pad" />
      {createFood.isError ? <Text variant="caption" color={c.warning}>Couldn’t save the food. Try again.</Text> : null}
    </Page>
  );
}
