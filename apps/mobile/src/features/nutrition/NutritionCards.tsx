/**
 * Nutrition tab blocks (docs/plans/NUTRITION_REDESIGN.md §3): week strip, daily summary rings,
 * meal cards, water glasses and the weight sparkline.
 */
import type { FoodLogDto, NutritionDayResponse } from '@lb/contracts';
import { nutrientsForGrams } from '@lb/engine';
import { dataColors } from '@lb/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { CountUp, Icon, type IconName, PressableScale, Text } from '@/ui';
import { Ring } from '@/ui/fx';
import { MEALS } from './draft';

const DAY = 86_400_000;
export const shiftDate = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
/** Monday of the week containing `iso`. */
export const mondayOf = (iso: string) => shiftDate(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
const WD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Serving text: "2 × 1 large egg" reads as "2 × large egg"; whole-number grams. */
export function servingText(l: Pick<FoodLogDto, 'servingLabel' | 'grams'>): string {
  const label = l.servingLabel?.replace(/^(\d+(?:\.\d+)?) × 1 /, '$1 × ') ?? null;
  return label ? `${label} · ${Math.round(l.grams)} g` : `${Math.round(l.grams)} g`;
}

/* ---------------- week strip ---------------- */

export function WeekStrip({ date, today, days, onPick }: {
  date: string; today: string; days: Record<string, { kcal: number; target: number; logged: boolean } | undefined>; onPick: (d: string) => void;
}) {
  const { c, radius } = useTheme();
  const monday = mondayOf(date);
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {WD.map((w, i) => {
        const d = shiftDate(monday, i);
        const future = d > today;
        const on = d === date;
        const info = days[d];
        const ratio = info?.logged && info.target ? info.kcal / info.target : 0;
        const over = ratio > 1.1;
        return (
          <PressableScale key={d} haptic="tap" disabled={future} onPress={() => onPick(d)} accessibilityRole="tab" accessibilityState={{ selected: on, disabled: future }}
            accessibilityLabel={`${new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${info?.logged ? `, ${info.kcal} of ${info.target} kcal` : ''}`}
            style={{
              flex: 1, alignItems: 'center', gap: 6, paddingVertical: 8, borderRadius: radius.md, opacity: future ? 0.35 : 1,
              backgroundColor: on ? `${c.mana}22` : 'transparent', borderWidth: on ? 1.5 : 1, borderColor: on ? c.mana : c.border,
            }}>
            <Text variant="micro" color={d === today ? c.mana : c.textMuted} style={{ fontFamily: 'Inter_600SemiBold' }}>{w}</Text>
            <Ring ratio={Math.min(1, ratio)} size={30} stroke={3} color={over ? c.warning : dataColors.calories} track="rgba(255,255,255,0.08)">
              <Text variant="micro" color={on ? c.text : c.textDim}>{String(Number(d.slice(8)))}</Text>
            </Ring>
          </PressableScale>
        );
      })}
    </View>
  );
}

/* ---------------- summary ---------------- */

export function SummaryCard({ day }: { day: NutritionDayResponse }) {
  const { c, radius, spacing } = useTheme();
  const { plan, totals, settings } = day;
  const proteinOnly = settings.nutritionMode === 'proteinOnly';
  const hide = settings.hideCalories || proteinOnly;
  const left = Math.round(plan.kcal - totals.kcal);
  const macros = [
    { label: 'Protein', eaten: totals.protein, target: plan.proteinG, color: dataColors.protein },
    ...(proteinOnly ? [] : [
      { label: 'Carbs', eaten: totals.carbs, target: plan.carbsG, color: dataColors.carbs },
      { label: 'Fat', eaten: totals.fat, target: plan.fatG, color: dataColors.fat },
    ]),
  ];
  return (
    <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${c.mana}44` }}>
      <LinearGradient colors={[`${c.mana}26`, c.surface]} style={{ padding: spacing[4], gap: spacing[4] }}>
        {!hide ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
            <Ring ratio={plan.kcal ? totals.kcal / plan.kcal : 0} size={128} stroke={12} color={left < 0 ? c.warning : dataColors.calories}>
              <CountUp variant="stat" value={Math.abs(left)} />
              <Text variant="caption" muted>{left < 0 ? 'kcal over' : 'kcal left'}</Text>
            </Ring>
            <View style={{ flex: 1, gap: spacing[3] }}>
              <KV icon="flag-outline" k="Target" v={`${plan.kcal.toLocaleString()} kcal`} />
              <KV icon="restaurant-outline" k="Eaten" v={`${Math.round(totals.kcal).toLocaleString()} kcal`} />
              {plan.calibrating ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="pulse-outline" size={14} color={c.mana} />
                  <Text variant="caption" color={c.mana}>{`Calibrating · ${plan.validDays}/10 days`}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {macros.map((m) => (
            <View key={m.label} style={{ alignItems: 'center', gap: 6 }}>
              <Ring ratio={m.target ? m.eaten / m.target : 0} size={proteinOnly ? 96 : 64} stroke={proteinOnly ? 9 : 6} color={m.color}>
                <Text variant={proteinOnly ? 'heading' : 'callout'} style={{ fontFamily: 'Inter_600SemiBold' }}>{`${Math.round(m.eaten)}`}</Text>
              </Ring>
              <Text variant="caption" color={m.color} style={{ fontFamily: 'Inter_600SemiBold' }}>{m.label}</Text>
              <Text variant="micro" muted>{`of ${Math.round(m.target)} g`}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

function KV({ icon, k, v }: { icon: IconName; k: string; v: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={14} color={c.textMuted} />
      <Text variant="caption" muted style={{ flex: 1 }}>{k}</Text>
      <Text variant="callout" style={{ fontFamily: 'Inter_600SemiBold' }}>{v}</Text>
    </View>
  );
}

/* ---------------- meals ---------------- */

export function MealCard({ meal, logs, hideKcal, onAdd, onEdit }: {
  meal: (typeof MEALS)[number]; logs: FoodLogDto[]; hideKcal: boolean; onAdd: () => void; onEdit: (l: FoodLogDto) => void;
}) {
  const { c, radius, spacing } = useTheme();
  const items = logs.map((l) => ({ l, n: nutrientsForGrams(l.food.per100, l.grams) }));
  const kcal = Math.round(items.reduce((s, x) => s + x.n.kcal, 0));
  const protein = Math.round(items.reduce((s, x) => s + x.n.protein, 0));
  return (
    <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4] }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${c.mana}1A` }}>
          <Icon name={meal.icon} size={18} color={c.mana} />
        </View>
        <Text variant="headline" style={{ flex: 1 }}>{meal.label}</Text>
        {logs.length ? (
          <View style={{ alignItems: 'flex-end' }}>
            {!hideKcal ? <Text variant="callout" style={{ fontFamily: 'Inter_600SemiBold' }}>{`${kcal} kcal`}</Text> : null}
            <Text variant="caption" color={dataColors.protein}>{`${protein} g protein`}</Text>
          </View>
        ) : null}
      </View>
      {items.map(({ l, n }) => (
        <PressableScale key={l.id} haptic="tap" onPress={() => onEdit(l)} accessibilityRole="button" accessibilityLabel={`Edit ${l.food.name}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: 1, borderColor: c.border }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="callout" numberOfLines={1}>{l.food.name}</Text>
              <Text variant="caption" muted numberOfLines={1}>{`${servingText(l)}${l.food.brand ? ` · ${l.food.brand}` : ''}`}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {!hideKcal ? <Text variant="callout">{Math.round(n.kcal)}</Text> : null}
              <Text variant="caption" color={dataColors.protein}>{`${Math.round(n.protein)} g P`}</Text>
            </View>
          </View>
        </PressableScale>
      ))}
      <PressableScale haptic="tap" onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add food to ${meal.label}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: 1, borderColor: c.border }}>
          <Icon name="add-circle" size={20} color={c.mana} />
          <Text variant="callout" color={c.mana} style={{ fontFamily: 'Inter_600SemiBold' }}>{logs.length ? 'Add more' : 'Add food'}</Text>
        </View>
      </PressableScale>
    </View>
  );
}

/* ---------------- day actions ---------------- */

export function ActionChip({ icon, label, onPress, active, loading }: { icon: IconName; label: string; onPress: () => void; active?: boolean; loading?: boolean }) {
  const { c, radius } = useTheme();
  return (
    <PressableScale haptic="tap" onPress={onPress} disabled={loading} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active, busy: !!loading }}
      style={{
        flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.md, opacity: loading ? 0.6 : 1,
        borderWidth: 1, borderColor: active ? c.success : c.border, backgroundColor: active ? `${c.success}1A` : c.surface,
      }}>
      <Icon name={icon} size={18} color={active ? c.success : c.mana} />
      <Text variant="caption" color={active ? c.success : c.text} style={{ fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
    </PressableScale>
  );
}

/* ---------------- water ---------------- */

const GLASS = 250;
export function WaterCard({ ml, targetMl, onSet }: { ml: number; targetMl: number; onSet: (ml: number) => void }) {
  const { c, radius, spacing } = useTheme();
  const color = dataColors.protein;
  const total = Math.max(8, Math.min(12, Math.round(targetMl / GLASS)));
  const filled = Math.round(ml / GLASS);
  // 0 → "0", 250 → "0.25", 1500 → "1.5"
  const litres = (ml / 1000).toFixed(2).replace(/\.?0+$/, '');
  return (
    <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: spacing[4], gap: spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ flex: 1 }}>
          <Text variant="headline">{`${litres} L water`}</Text>
          <Text variant="caption" muted>{`Goal ~${(targetMl / 1000).toFixed(1)} L · ${filled} ${filled === 1 ? 'glass' : 'glasses'}`}</Text>
        </View>
        <PressableScale haptic="tap" disabled={ml <= 0} onPress={() => onSet(Math.max(0, ml - GLASS))} accessibilityRole="button" accessibilityLabel="Remove a glass of water"
          style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised, opacity: ml <= 0 ? 0.4 : 1 }}>
          <Icon name="remove" size={20} color={c.text} />
        </PressableScale>
        <PressableScale haptic="tap" onPress={() => onSet(ml + GLASS)} accessibilityRole="button" accessibilityLabel="Add a glass of water"
          style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}>
          <Icon name="add" size={20} color="#07070B" />
        </PressableScale>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {Array.from({ length: total }, (_, i) => {
          const full = i < filled;
          return (
            // tap a glass to set the amount to it (tap the last full one to empty it)
            <PressableScale key={i} haptic="none" onPress={() => { haptics.tap(); onSet((full && i === filled - 1 ? i : i + 1) * GLASS); }}
              accessibilityRole="button" accessibilityLabel={`${i + 1} ${i ? 'glasses' : 'glass'}`} hitSlop={4}>
              <Icon name={full ? 'water' : 'water-outline'} size={total > 10 ? 20 : 24} color={full ? color : c.textMuted} />
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/* ---------------- weight ---------------- */

export function WeightCard({ points, trendKg, onPress }: { points: { kg: number; trend: number }[]; trendKg: number; onPress: () => void }) {
  const { c, radius, spacing } = useTheme();
  const last = points.slice(-14);
  const vals = last.map((p) => p.trend);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(0.5, hi - lo);
  const change = last.length >= 2 ? last.at(-1)!.trend - last[0]!.trend : 0;
  return (
    <PressableScale haptic="tap" onPress={onPress} accessibilityRole="button" accessibilityLabel={points.length ? `Weight trend ${trendKg.toFixed(1)} kilograms` : 'Log your first weigh-in'}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: spacing[4] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" muted>Weight trend</Text>
          {points.length ? (
            <>
              <Text variant="title">{`${trendKg.toFixed(1)} kg`}</Text>
              <Text variant="caption" color={Math.abs(change) < 0.05 ? c.textMuted : c.mana}>
                {last.length >= 2 ? `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)} kg over ${last.length} weigh-ins` : '1 weigh-in · add more to see the trend'}
              </Text>
            </>
          ) : (
            <>
              <Text variant="headline">Log your first weigh-in</Text>
              <Text variant="caption" muted>Weigh-ins teach the System your real metabolism.</Text>
            </>
          )}
        </View>
        {last.length >= 2 ? (
          <View style={{ width: 96, height: 44, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
            {last.map((p, i) => (
              <View key={i} style={{ flex: 1, height: 8 + ((p.trend - lo) / span) * 36, borderRadius: 2, backgroundColor: i === last.length - 1 ? c.mana : `${c.mana}55` }} />
            ))}
          </View>
        ) : null}
        <Icon name="chevron-forward" size={16} color={c.textMuted} />
      </View>
    </PressableScale>
  );
}
