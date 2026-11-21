import type { FoodLogDto, Meal } from '@lb/contracts';
import { TDEE } from '@lb/engine';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { MEALS, useFoodDraft, useGameDate, useNutritionActions, useNutritionDay, useNutritionDays, useNutritionSummary } from '@/features/nutrition';
import { ActionChip, MealCard, mondayOf, shiftDate, SummaryCard, WaterCard, WeekStrip, WeightCard } from '@/features/nutrition/NutritionCards';
import { useTheme } from '@/theme';
import { Appear, Button, Card, Icon, PressableScale, Screen, SectionHeader, Text } from '@/ui';

const label = (date: string, today: string) =>
  date === today ? 'Today' : date === shiftDate(today, -1) ? 'Yesterday'
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
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDate(mondayOf(date), i)), [date]);
  const week = useNutritionDays(weekDates);

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

  const hideKcal = data.settings.hideCalories || data.settings.nutritionMode === 'proteinOnly';
  return (
    <Screen title="Nutrition" subtitle={label(date, today)} accent={c.mana} right={settings}>
      <Appear index={0}>
        <WeekStrip date={date} today={today} days={week} onPick={setDate} />
      </Appear>
      {date !== today ? (
        <PressableScale haptic="tap" onPress={() => setDate(today)} accessibilityRole="button" accessibilityLabel="Back to today"
          style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: `${c.mana}22`, borderWidth: 1, borderColor: `${c.mana}55` }}>
          <Icon name="arrow-undo-outline" size={15} color={c.mana} />
          <Text variant="callout" color={c.mana} style={{ fontFamily: 'Inter_600SemiBold' }}>{`Viewing ${label(date, today)} · Back to today`}</Text>
        </PressableScale>
      ) : null}

      <Appear index={1}><SummaryCard day={data} /></Appear>

      {data.plan.lowIntake ? (
        // SYSTEMS.md §2.8 safety rule: supportive, never shaming; the deficit stops deepening meanwhile
        <Card tint={c.mana}>
          <Text variant="label" color={c.mana}>Checking in</Text>
          <Text variant="callout">A few of your recent days were very low in energy. Your body needs fuel to train, recover and stay healthy.</Text>
          <Text variant="caption" muted>
            {"Your targets won't get any lower for now. If eating enough feels hard, or food feels stressful, a doctor or registered dietitian can help, and you can switch to protein-only mode or hide calories any time in settings."}
          </Text>
          <Button variant="secondary" size="md" label="Nutrition settings" onPress={() => router.push('/diary/settings')} />
        </Card>
      ) : null}

      {data.markedComplete && data.logs.length > 0 && data.totals.kcal < TDEE.suspiciousCompleteDayKcal && !data.lowDayConfirm ? (
        // §2.3: a complete day under 800 kcal only counts toward your metabolism once you confirm it
        <Card>
          <Text variant="headline">Was this a full day?</Text>
          <Text variant="caption" muted>{`This day is marked complete at ${data.totals.kcal.toLocaleString()} kcal. If some food wasn't logged, we'll leave this day out so your targets stay accurate.`}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" size="md" label="Yes, that's all" onPress={() => setDay.mutate({ localDate: date, lowDayConfirm: true })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" size="md" label="Some is missing" onPress={() => setDay.mutate({ localDate: date, markedComplete: false })} />
            </View>
          </View>
        </Card>
      ) : null}

      <Appear index={2} style={{ gap: spacing[3] }}>
        {MEALS.map((m) => (
          <MealCard key={m.id} meal={m} logs={data.logs.filter((l) => l.meal === m.id)} hideKcal={hideKcal} onAdd={() => add(m.id)} onEdit={edit} />
        ))}
      </Appear>

      <Appear index={3} style={{ gap: spacing[2] }}>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <ActionChip icon="copy-outline" label="Copy yesterday" loading={copy.isPending} onPress={() => copy.mutate({ fromDate: shiftDate(date, -1), toDate: date })} />
          <ActionChip icon="bookmark-outline" label="Templates" onPress={() => router.push('/diary/templates')} />
          <ActionChip icon={data.markedComplete ? 'checkmark-circle' : 'checkmark-circle-outline'} label={data.markedComplete ? 'Day complete' : 'Complete day'} active={data.markedComplete}
            onPress={() => setDay.mutate({ localDate: date, markedComplete: !data.markedComplete })} />
        </View>
        {copy.isError ? <Text variant="caption" color={c.warning}>Nothing logged the day before to copy.</Text> : null}
        {copy.isSuccess && copy.data === 0 ? <Text variant="caption" muted>Already copied.</Text> : null}
        {!data.markedComplete && data.logs.length > 0 ? (
          <Text variant="caption" muted>Mark the day complete when you have logged everything: complete days teach the System your metabolism.</Text>
        ) : null}
      </Appear>

      <Appear index={4}>
        <WaterCard ml={data.waterMl} targetMl={data.plan.waterMl} onSet={(ml) => setDay.mutate({ localDate: date, waterMl: ml })} />
      </Appear>

      {summary ? (
        <Appear index={5} style={{ gap: spacing[3] }}>
          <SectionHeader title="Progress" />
          <WeightCard points={summary.weighIns} trendKg={summary.plan.trendKg} onPress={() => router.push('/diary/weight')} />
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

