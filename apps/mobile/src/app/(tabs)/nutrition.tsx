import type { FoodLogDto, Meal, NutritionDayResponse } from '@lb/contracts';
import { nutrientsForGrams } from '@lb/engine';
import { dataColors } from '@lb/tokens';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { MEALS, useFoodDraft, useNutritionActions, useNutritionDay, useNutritionSummary, useGameDate } from '@/features/nutrition';
import { useTheme } from '@/theme';
import { Appear, Bar, Button, Card, CountUp, Icon, Pill, PressableScale, Screen, SectionHeader, Text } from '@/ui';
import { Ring } from '@/ui/fx';

const DAY = 86_400_000;
const shift = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
const label = (date: string, today: string) =>
  date === today ? 'Today' : date === shift(today, -1) ? 'Yesterday' : date === shift(today, 1) ? 'Tomorrow'
  : new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** The food diary (SYSTEMS.md §2.10): targets, meals, water, weight trend and the weekly check-in. */
export default function NutritionScreen() {
  const { c, spacing } = useTheme();
  const today = useGameDate();
  const [date, setDate] = useState(today);
  const { data } = useNutritionDay(date);
  const { data: summary } = useNutritionSummary();
  const { setDay, copy } = useNutritionActions();
  const draft = useFoodDraft((s) => s.set);

  const settings = (
    <PressableScale haptic="tap" onPress={() => router.push('/diary/settings')} accessibilityRole="button" accessibilityLabel="Nutrition settings"
      style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised }}>
      <Icon name="options-outline" size={18} color={c.text} />
    </PressableScale>
  );
  if (!data) return <Screen title="Nutrition" right={settings}><Text dim>Loading…</Text></Screen>;

  if (data.settings.nutritionMode === 'off') {
    return (
      <Screen title="Nutrition" right={settings}>
        <Card>
          <Text variant="headline">Nutrition tracking is off</Text>
          <Text variant="callout" dim>Training, quests and ranks work without it. Turn it back on any time.</Text>
          <Button variant="secondary" size="md" label="Nutrition settings" onPress={() => router.push('/diary/settings')} />
        </Card>
      </Screen>
    );
  }

  const add = (meal: Meal) => {
    draft({ meal, date, logId: null, food: null, grams: null, servingLabel: null });
    router.push({ pathname: '/diary/add', params: { meal, date } });
  };
  const edit = (l: FoodLogDto) => {
    draft({ meal: l.meal, date, logId: l.id, food: l.food, grams: l.grams, servingLabel: l.servingLabel ?? null });
    router.push('/diary/portion');
  };

  return (
    <Screen title="Nutrition" subtitle="Real food, real targets, adapted to your progress." accent={c.mana} right={settings}>
      {/* date switcher */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <PressableScale haptic="tap" onPress={() => setDate(shift(date, -1))} accessibilityRole="button" accessibilityLabel="Previous day" style={{ padding: spacing[2] }}>
          <Icon name="chevron-back" size={20} color={c.text} />
        </PressableScale>
        <PressableScale haptic="tap" onPress={() => setDate(today)} accessibilityRole="button" accessibilityLabel="Go to today">
          <Text variant="headline">{label(date, today)}</Text>
        </PressableScale>
        <PressableScale haptic="tap" disabled={date >= today} onPress={() => setDate(shift(date, 1))} accessibilityRole="button" accessibilityLabel="Next day" style={{ padding: spacing[2], opacity: date >= today ? 0.3 : 1 }}>
          <Icon name="chevron-forward" size={20} color={c.text} />
        </PressableScale>
      </View>

      <Appear index={1}><Targets day={data} /></Appear>

      <Appear index={2} style={{ gap: spacing[3] }}>
        {MEALS.map((m) => <MealSection key={m.id} meal={m} logs={data.logs.filter((l) => l.meal === m.id)} hideKcal={data.settings.hideCalories || data.settings.nutritionMode === 'proteinOnly'} onAdd={() => add(m.id)} onEdit={edit} />)}
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" size="md" label="Copy yesterday" loading={copy.isPending}
              onPress={() => copy.mutate({ fromDate: shift(date, -1), toDate: date })} />
          </View>
          <View style={{ flex: 1 }}>
            <Button variant={data.markedComplete ? 'primary' : 'secondary'} size="md" icon={data.markedComplete ? 'checkmark-circle' : 'checkmark-circle-outline'}
              label={data.markedComplete ? 'Completed' : 'Complete'} onPress={() => setDay.mutate({ localDate: date, markedComplete: !data.markedComplete })} />
          </View>
        </View>
        {copy.isError ? <Text variant="caption" color={c.warning}>Nothing logged yesterday to copy.</Text> : null}
      </Appear>

      <Appear index={3}><Water day={data} onSet={(ml) => setDay.mutate({ localDate: date, waterMl: ml })} /></Appear>

      {summary ? (
        <Appear index={4} style={{ gap: spacing[3] }}>
          <SectionHeader title="Weight & weekly check-in" />
          <PressableScale haptic="tap" onPress={() => router.push('/diary/weight')} accessibilityRole="button" accessibilityLabel="Weight trend">
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                <Icon name="scale-outline" size={22} color={c.mana} />
                <View style={{ flex: 1 }}>
                  <Text variant="headline">{summary.weighIns.length ? `${summary.plan.trendKg.toFixed(1)} kg trend` : 'Log your first weigh-in'}</Text>
                  <Text variant="caption" muted>{summary.weighIns.length ? `${summary.weighIns.length} weigh-in${summary.weighIns.length === 1 ? '' : 's'} · morning, after the bathroom, works best` : 'Weigh-ins let the System learn your real metabolism.'}</Text>
                </View>
                <Icon name="chevron-forward" size={18} color={c.textMuted} />
              </View>
            </Card>
          </PressableScale>
          <Card tint={summary.checkIn.verdict === 'onTrack' ? c.success : summary.checkIn.verdict === 'insufficient' ? undefined : c.warning}>
            <Text variant="label" color={c.mana}>System debrief</Text>
            <Text variant="callout">{summary.checkIn.message}</Text>
            <Text variant="caption" muted>
              {summary.plan.calibrating
                ? `Calibrating your metabolism: ${summary.plan.validDays} of 10 logged days so far. Targets use the standard formula until then.`
                : `Your measured expenditure: ${summary.plan.tdee.toLocaleString()} kcal/day (${Math.round(summary.plan.confidence * 100)}% confidence).`}
            </Text>
          </Card>
        </Appear>
      ) : null}
      <Text variant="micro" muted style={{ textAlign: 'center' }}>Food data: USDA FoodData Central · Open Food Facts (ODbL)</Text>
    </Screen>
  );
}

function Targets({ day }: { day: NutritionDayResponse }) {
  const { c, spacing } = useTheme();
  const { plan, totals, settings } = day;
  const proteinOnly = settings.nutritionMode === 'proteinOnly';
  const hide = settings.hideCalories || proteinOnly;
  const left = Math.round(plan.kcal - totals.kcal);
  const macros = [
    { label: 'Protein', sub: 'Mana', eaten: totals.protein, target: plan.proteinG, color: dataColors.protein },
    ...(proteinOnly ? [] : [
      { label: 'Carbs', eaten: totals.carbs, target: plan.carbsG, color: dataColors.carbs },
      { label: 'Fat', eaten: totals.fat, target: plan.fatG, color: dataColors.fat },
      { label: 'Fiber', eaten: totals.fiber, target: plan.fiberG, color: c.textDim },
    ]),
  ];
  return (
    <Card>
      {!hide ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
          <Ring ratio={totals.kcal / plan.kcal} size={112} stroke={11} color={left < 0 ? c.warning : dataColors.calories}>
            <CountUp variant="stat" value={Math.abs(left)} />
            <Text variant="caption" muted>{left < 0 ? 'kcal over' : 'kcal left'}</Text>
          </Ring>
          <View style={{ flex: 1, gap: spacing[2] }}>
            <Row k="Target" v={`${plan.kcal.toLocaleString()} kcal`} />
            <Row k="Eaten" v={`${totals.kcal.toLocaleString()} kcal`} />
            <Row k="Goal" v={settings.goal === 'maintain' || settings.goal === 'recomp' ? settings.goal === 'recomp' ? 'Recomp' : 'Maintain' : `${settings.ratePerWeek > 0 ? '+' : '−'}${Math.abs(settings.ratePerWeek * 100).toFixed(2).replace(/0$/, '')}%/wk`} />
            {plan.calibrating ? <Pill icon="pulse-outline" label="Calibrating" color={c.mana} /> : null}
          </View>
        </View>
      ) : null}
      {macros.map((x) => (
        <View key={x.label} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text variant="callout">
              {x.label}
              {x.sub ? <Text variant="caption" color={x.color}>{`  ${x.sub}`}</Text> : null}
            </Text>
            <Text variant="callout" dim>{`${Math.round(x.eaten)} / ${Math.round(x.target)} g`}</Text>
          </View>
          <Bar ratio={x.target ? x.eaten / x.target : 0} height={x.label === 'Protein' ? 8 : 5} color={x.color} />
        </View>
      ))}
    </Card>
  );
}

function MealSection({ meal, logs, hideKcal, onAdd, onEdit }: {
  meal: (typeof MEALS)[number]; logs: FoodLogDto[]; hideKcal: boolean; onAdd: () => void; onEdit: (l: FoodLogDto) => void;
}) {
  const { c, spacing } = useTheme();
  const items = logs.map((l) => ({ l, n: nutrientsForGrams(l.food.per100, l.grams) }));
  const kcal = Math.round(items.reduce((s, x) => s + x.n.kcal, 0));
  const protein = Math.round(items.reduce((s, x) => s + x.n.protein, 0));
  return (
    <Card padded={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4] }}>
        <Icon name={meal.icon} size={18} color={c.textDim} />
        <View style={{ flex: 1 }}>
          <Text variant="headline">{meal.label}</Text>
          {logs.length ? <Text variant="caption" muted>{hideKcal ? `${protein} g protein` : `${kcal} kcal · ${protein} g protein`}</Text> : null}
        </View>
        <PressableScale haptic="tap" onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add food to ${meal.label}`}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: `${c.mana}22` }}>
          <Icon name="add" size={22} color={c.mana} />
        </PressableScale>
      </View>
      {items.map(({ l, n }) => (
        <PressableScale key={l.id} haptic="tap" onPress={() => onEdit(l)} accessibilityRole="button" accessibilityLabel={`Edit ${l.food.name}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: 1, borderColor: c.border }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="callout" numberOfLines={1}>{l.food.name}</Text>
              <Text variant="caption" muted numberOfLines={1}>{`${l.servingLabel ? `${l.servingLabel} · ` : ''}${Math.round(l.grams)} g${l.food.brand ? ` · ${l.food.brand}` : ''}`}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {!hideKcal ? <Text variant="callout">{Math.round(n.kcal)}</Text> : null}
              <Text variant="caption" color={dataColors.protein}>{`${Math.round(n.protein)} g P`}</Text>
            </View>
          </View>
        </PressableScale>
      ))}
    </Card>
  );
}

function Water({ day, onSet }: { day: NutritionDayResponse; onSet: (ml: number) => void }) {
  const { c, spacing } = useTheme();
  const target = day.plan.waterMl;
  const glasses = Math.round(day.waterMl / 250);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Icon name="water-outline" size={20} color={dataColors.protein} />
        <View style={{ flex: 1 }}>
          <Text variant="headline">{`${(day.waterMl / 1000).toFixed(2).replace(/0$/, '')} L water`}</Text>
          <Text variant="caption" muted>{`Guide ~${(target / 1000).toFixed(1)} L · ${glasses} glass${glasses === 1 ? '' : 'es'}`}</Text>
        </View>
        <PressableScale haptic="tap" disabled={day.waterMl <= 0} onPress={() => onSet(Math.max(0, day.waterMl - 250))} accessibilityRole="button" accessibilityLabel="Remove a glass of water"
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised, opacity: day.waterMl <= 0 ? 0.4 : 1 }}>
          <Icon name="remove" size={20} color={c.text} />
        </PressableScale>
        <PressableScale haptic="tap" onPress={() => onSet(day.waterMl + 250)} accessibilityRole="button" accessibilityLabel="Add a glass of water"
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: `${dataColors.protein}22` }}>
          <Icon name="add" size={20} color={dataColors.protein} />
        </PressableScale>
      </View>
      <Bar ratio={target ? day.waterMl / target : 0} height={5} color={dataColors.protein} />
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <Text variant="caption" muted>{k}</Text>
      <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>{v}</Text>
    </View>
  );
}
