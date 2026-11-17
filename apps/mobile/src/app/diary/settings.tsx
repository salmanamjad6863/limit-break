import type { NutritionSettings } from '@lb/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useNutritionActions, useNutritionSummary } from '@/features/nutrition';
import { useTheme } from '@/theme';
import { Button, Card, Page, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';
import { Segmented, TextField } from '@/ui/form';

const GOALS = [
  { value: 'cut', label: 'Lose fat' }, { value: 'maintain', label: 'Maintain' }, { value: 'recomp', label: 'Recomp' }, { value: 'bulk', label: 'Build' },
] as const;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const rateLabel = (r: number) => (r === 0 ? 'Hold weight' : `${r > 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(2).replace(/0$/, '')}% / week`);
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

/** Every nutrition choice, editable any time (SYSTEMS.md §2.10). Unsafe rates are never offered. */
export default function NutritionSettingsScreen() {
  const { c, spacing, radius } = useTheme();
  const { data } = useNutritionSummary();
  const { updateSettings } = useNutritionActions();
  const [s, setS] = useState<NutritionSettings | null>(null);
  const [protein, setProtein] = useState<string | null>(null);
  const [fat, setFat] = useState<string | null>(null);
  const [bf, setBf] = useState<string | null>(null);
  if (!data) return <Page header={<ScreenHeader title="Nutrition settings" />}><Text dim>Loading…</Text></Page>;
  const cur = s ?? data.settings;
  const set = (p: Partial<NutritionSettings>) => setS({ ...cur, ...p });
  // rates are BMI/age-gated by the engine; when the goal changes, pick that goal's default
  const ratesFor = (goal: NutritionSettings['goal']) =>
    goal === 'cut' ? data.allowedRates.length && data.settings.goal === 'cut' ? data.allowedRates : [-0.0025, -0.005, -0.0075]
    : goal === 'bulk' ? [0.001, 0.0025, 0.005] : [0];
  const rates = cur.goal === data.settings.goal ? data.allowedRates : ratesFor(cur.goal);
  const pText = protein ?? (cur.proteinOverrideG != null ? String(cur.proteinOverrideG) : '');
  const fText = fat ?? (cur.fatOverrideG != null ? String(cur.fatOverrideG) : '');
  const bfText = bf ?? (cur.bodyFatPct != null ? String(cur.bodyFatPct) : '');
  const next: NutritionSettings = {
    ...cur,
    ratePerWeek: rates.includes(cur.ratePerWeek) ? cur.ratePerWeek : (rates.find((r) => r === (cur.goal === 'cut' ? -0.005 : cur.goal === 'bulk' ? 0.001 : 0)) ?? rates[0] ?? 0),
    proteinOverrideG: num(pText), fatOverrideG: num(fText), bodyFatPct: num(bfText),
  };
  const invalid = (next.proteinOverrideG != null && (next.proteinOverrideG < 40 || next.proteinOverrideG > 400)) ||
    (next.fatOverrideG != null && (next.fatOverrideG < 20 || next.fatOverrideG > 250)) ||
    (next.bodyFatPct != null && (next.bodyFatPct < 3 || next.bodyFatPct > 60));

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <PressableScale key={label} haptic="tap" onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={{ paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? c.mana : c.border, backgroundColor: on ? `${c.mana}1F` : c.surfaceRaised }}>
      <Text variant="callout" color={on ? c.text : c.textDim}>{label}</Text>
    </PressableScale>
  );

  return (
    <Page accent={c.mana} header={<ScreenHeader title="Nutrition settings" />}
      footer={<Button label="Save" icon="checkmark" disabled={invalid} loading={updateSettings.isPending} onPress={() => updateSettings.mutate(next, { onSuccess: () => router.back() })} />}>
      <SectionHeader title="Goal" />
      <Segmented options={GOALS.map((g) => ({ value: g.value, label: g.label }))} value={cur.goal} onChange={(goal) => set({ goal })} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {rates.map((r) => chip(rateLabel(r), next.ratePerWeek === r, () => set({ ratePerWeek: r })))}
      </View>
      <Text variant="caption" muted>
        {cur.goal === 'cut' ? 'Slower cuts keep more muscle and are easier to sustain. −0.5%/week is the sweet spot for most.'
          : cur.goal === 'bulk' ? 'A lean bulk (+0.1%/week) builds muscle with the least fat gain.'
          : cur.goal === 'recomp' ? 'Eat at maintenance with high protein and train hard: lose fat and build muscle slowly.'
          : 'Hold your weight steady; targets still adapt to your real expenditure.'}
      </Text>

      <SectionHeader title="How you eat" />
      <Text variant="label" muted>Macro style</Text>
      <Segmented options={[{ value: 'lower', label: 'Lower fat' }, { value: 'balanced', label: 'Balanced' }, { value: 'higher', label: 'Higher fat' }]} value={cur.fatPreference} onChange={(fatPreference) => set({ fatPreference })} />
      <Text variant="label" muted>Tracking mode</Text>
      <Segmented options={[{ value: 'full', label: 'Full' }, { value: 'proteinOnly', label: 'Protein only' }, { value: 'off', label: 'Off' }]} value={cur.nutritionMode} onChange={(nutritionMode) => set({ nutritionMode })} />
      <PressableScale haptic="tap" onPress={() => set({ hideCalories: !cur.hideCalories })} accessibilityRole="switch" accessibilityState={{ checked: cur.hideCalories }} accessibilityLabel="Hide calories">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text variant="callout">Hide calories</Text>
              <Text variant="caption" muted>Show macros only. Targets still work in the background.</Text>
            </View>
            <Text variant="headline" color={cur.hideCalories ? c.mana : c.textMuted}>{cur.hideCalories ? 'On' : 'Off'}</Text>
          </View>
        </Card>
      </PressableScale>

      <SectionHeader title="Your body" />
      <Text variant="label" muted>Daily activity outside training</Text>
      <Segmented options={[{ value: 'sedentary', label: 'Desk' }, { value: 'light', label: 'Light' }, { value: 'active', label: 'Active' }, { value: 'veryActive', label: 'Very' }]} value={cur.lifestyle} onChange={(lifestyle) => set({ lifestyle })} />
      <TextField label="Body fat % (optional, improves protein targets)" placeholder="e.g. 18" value={bfText} onChangeText={setBf} keyboardType="decimal-pad" />

      <SectionHeader title="Weekly check-in day" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {DAYS.map((day, i) => chip(day, cur.checkInDay === i, () => set({ checkInDay: i })))}
      </View>

      <SectionHeader title="Manual macros (optional)" />
      <Text variant="caption" muted>Set protein and/or fat yourself (for example from your coach). Carbs fill the remaining calories. Leave empty for automatic.</Text>
      <TextField label={`Protein (g) · auto ${data.plan.proteinG}`} placeholder="auto" value={pText} onChangeText={setProtein} keyboardType="number-pad" />
      <TextField label={`Fat (g) · auto ${data.plan.fatG}`} placeholder="auto" value={fText} onChangeText={setFat} keyboardType="number-pad" />
      {invalid ? <Text variant="caption" color={c.warning}>Protein 40–400 g, fat 20–250 g, body fat 3–60%.</Text> : null}
      {updateSettings.isError ? <Text variant="caption" color={c.warning}>Couldn’t save. That rate isn’t available for this goal.</Text> : null}
      <Text variant="caption" muted>Safety: targets never go below your BMR or a safe floor, and deficits are capped. No rewards are ever given for eating less.</Text>
    </Page>
  );
}
