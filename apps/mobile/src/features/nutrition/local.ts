/**
 * On-device nutrition for demo/offline mode. Same engine functions as the server
 * (apps/api/src/modules/nutrition/service.ts), so the numbers match exactly.
 */
import { curatedFoodById, curatedFoods } from '@lb/content';
import {
  allowedRates, ageOn, bmi, computeTrend, nutrientsForGrams, rankFoods, weeklyCheckIn, weeklyTargets,
  type IntakeDay, type NutritionProfileInput, type PersonalUse, type StoredTarget,
} from '@lb/engine';
import type {
  FoodDto, FoodLogDto, NutritionDayResponse, NutritionPlanDto, NutritionProfile, NutritionSummaryResponse, Totals, TrainingProfile,
} from '@lb/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

export interface NutritionLocalState {
  logs: FoodLogDto[];
  /** barcode and custom foods the user has used (curated foods come from content) */
  foods: Record<string, FoodDto>;
  weighIns: { id: string; date: string; kg: number }[];
  days: Record<string, { waterMl: number; markedComplete: boolean; lowDayConfirm?: boolean }>;
  targets: StoredTarget[];
  set: (patch: Partial<Omit<NutritionLocalState, 'set'>>) => void;
}

export const useNutritionLocal = create<NutritionLocalState>()(
  persist((set) => ({ logs: [], foods: {}, weighIns: [], days: {}, targets: [], set: (patch) => set(patch) }), {
    name: 'lb-nutrition', storage: createJSONStorage(() => zustandStorage),
  }),
);

export type LocalData = Omit<NutritionLocalState, 'set'>;

const round1 = (n: number) => Math.round(n * 10) / 10;
export const asDto = (f: (typeof curatedFoods)[number]): FoodDto => ({ ...f, brand: f.brand ?? null, barcode: f.barcode ?? null });
export const foodFor = (id: string, d: LocalData): FoodDto | undefined => {
  const c = curatedFoodById.get(id);
  return c ? asDto(c) : d.foods[id];
};

export function totalsOf(logs: readonly { food: FoodDto; grams: number }[]): Totals {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const l of logs) {
    const n = nutrientsForGrams(l.food.per100, l.grams);
    t.kcal += n.kcal; t.protein += n.protein; t.carbs += n.carbs; t.fat += n.fat; t.fiber += n.fiber ?? 0;
  }
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat), fiber: round1(t.fiber) };
}

/** Planner input from the profile, with the latest weigh-in (or onboarding weight) as the start. */
export function profileInput(n: NutritionProfile, t: TrainingProfile, d: LocalData): NutritionProfileInput {
  return {
    sex: t.sex, birthDate: n.birthDate, heightCm: t.heightCm, weightKg: d.weighIns.at(-1)?.kg ?? t.weightKg, bodyFatPct: n.bodyFatPct,
    lifestyle: n.lifestyle, goal: n.goal, ratePerWeek: n.ratePerWeek, fatPreference: n.fatPreference,
    weeklySessions: Array.from({ length: t.daysPerWeek }, () => ({ kind: 'strength' as const, minutes: t.sessionMinutes })),
  };
}

function intakeDays(d: LocalData, today: string): IntakeDay[] {
  const by = new Map<string, { kcal: number; meals: Set<string> }>();
  for (const l of d.logs) {
    if (l.localDate >= today) continue;
    const x = by.get(l.localDate) ?? { kcal: 0, meals: new Set<string>() };
    x.kcal += nutrientsForGrams(l.food.per100, l.grams).kcal;
    x.meals.add(l.meal);
    by.set(l.localDate, x);
  }
  return [...by].map(([date, x]) => ({ date, kcal: x.kcal, meals: x.meals.size, markedComplete: d.days[date]?.markedComplete ?? false,
    lowDayConfirmed: d.days[date]?.lowDayConfirm ?? false,
  }));
}

/** Pure: weekly-stable plan + the target row to persist (applied by the caller outside render). */
export function localPlan(n: NutritionProfile, t: TrainingProfile, d: LocalData, today: string, trainingHoursToday = 0): { plan: NutritionPlanDto; storeTarget: StoredTarget | null } {
  const latest = [...d.targets].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0] ?? null;
  const r = weeklyTargets({
    profile: profileInput(n, t, d), weighIns: d.weighIns, intake: intakeDays(d, today), today, latest,
    override: { proteinG: n.proteinOverrideG, fatG: n.fatOverrideG }, trainingHoursToday,
  });
  const m = r.macros;
  const pm = r.plan.macros;
  return {
    plan: {
      kcal: Math.round(m.kcal), proteinG: Math.round(m.proteinG), fatG: Math.round(m.fatG), carbsG: Math.round(m.carbsG), fiberG: Math.round(m.fiberG),
      waterMl: Math.round(m.waterMl / 50) * 50, tdee: Math.round(r.plan.tdee), prior: Math.round(r.plan.prior), bmr: Math.round(r.plan.bmr),
      trendKg: round1(r.plan.trendKg), confidence: Math.round(r.plan.confidence * 100) / 100, calibrating: r.plan.calibrating,
      validDays: r.plan.validDays, rails: r.plan.target.appliedRails, effectiveFrom: r.effectiveFrom, lowIntake: r.plan.lowIntake,
    },
    storeTarget: r.store
      ? { effectiveFrom: today, kcal: r.plan.target.kcal, proteinG: pm.proteinG, fatG: pm.fatG, carbsG: pm.carbsG, fiberG: pm.fiberG, goal: n.goal, ratePerWeek: n.ratePerWeek }
      : null,
  };
}

export const settingsOf = ({ birthDate: _b, ...s }: NutritionProfile) => s;

export function localDay(n: NutritionProfile, t: TrainingProfile, d: LocalData, date: string, today: string, trainingHours = 0) {
  const { plan, storeTarget } = localPlan(n, t, d, today, trainingHours);
  const logs = d.logs.filter((l) => l.localDate === date).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const response: NutritionDayResponse = {
    date, logs, waterMl: d.days[date]?.waterMl ?? 0, markedComplete: d.days[date]?.markedComplete ?? false,
    lowDayConfirm: d.days[date]?.lowDayConfirm ?? false, totals: totalsOf(logs), plan, settings: settingsOf(n),
  };
  return { response, storeTarget };
}

export function localSummary(n: NutritionProfile, t: TrainingProfile, d: LocalData, today: string, trainingHours = 0) {
  const { plan, storeTarget } = localPlan(n, t, d, today, trainingHours);
  const trend = computeTrend(d.weighIns);
  const ids = new Map(d.weighIns.map((w) => [w.date, w.id]));
  const response: NutritionSummaryResponse = {
    plan, settings: settingsOf(n),
    weighIns: trend.slice(-90).map((p) => ({ id: ids.get(p.date) ?? p.date, date: p.date, kg: p.kg, trend: round1(p.trend) })),
    checkIn: weeklyCheckIn({ intake: intakeDays(d, today), weighIns: d.weighIns, kcalTarget: plan.kcal, goal: n.goal, ratePerWeek: n.ratePerWeek, trendKg: plan.trendKg, today }),
    allowedRates: allowedRates(n.goal, { bmi: bmi(plan.trendKg, t.heightCm), ageYears: ageOn(n.birthDate, today) }),
  };
  return { response, storeTarget };
}

/** Search: curated + your barcode/custom foods, ranked with your history (§2.7). */
export function localSearch(q: string, d: LocalData, today: string): FoodDto[] {
  const personal = new Map<string, PersonalUse>();
  const t = Date.parse(`${today}T00:00:00Z`);
  for (const l of d.logs) {
    const u = personal.get(l.food.id) ?? { count: 0, daysSinceLast: 999 };
    u.count++;
    u.daysSinceLast = Math.min(u.daysSinceLast, Math.floor((t - Date.parse(`${l.localDate}T00:00:00Z`)) / 86_400_000));
    personal.set(l.food.id, u);
  }
  const pool = new Map<string, FoodDto>(curatedFoods.map((f) => [f.id, asDto(f)]));
  for (const f of Object.values(d.foods)) pool.set(f.id, f);
  const all = [...pool.values()];
  if (!q.trim()) return all.filter((f) => personal.has(f.id)).sort((a, b) => personal.get(b.id)!.count - personal.get(a.id)!.count).slice(0, 20);
  return rankFoods(q, all, personal, 30);
}

/** Fallback nutrition profile for hunters created before nutrition settings existed. */
export function defaultNutrition(t: TrainingProfile): NutritionProfile {
  const y = new Date().getUTCFullYear() - 25;
  return {
    birthDate: `${y}-01-01`, goal: t.goal, ratePerWeek: t.goal === 'cut' ? -0.005 : t.goal === 'bulk' ? 0.001 : 0, fatPreference: 'balanced',
    lifestyle: 'light', nutritionMode: 'full', bodyFatPct: null, checkInDay: 1, hideCalories: false, proteinOverrideG: null, fatOverrideG: null,
  };
}
