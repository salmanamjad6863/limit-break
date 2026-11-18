/**
 * The full nutrition plan from real data — SYSTEMS.md §2.2–2.5 and §2.9.
 * Pure: the server runs it nightly, the app runs it on-device in demo/offline mode. Same numbers.
 */
import { computeTrend, weightSlopePerDay, type WeighIn } from '../body/trend';
import type { Sex } from '../body';
import { TDEE } from '../constants';
import { DAY_MS } from '../math';
import { bmr, isValidIntakeDay, tdeePrior, updateTdee, type IntakeDay, type Lifestyle, type PlannedSession } from './energy';
import { needsLowIntakeCheckIn } from './food';
import { calorieTarget, macroTargets, type CalorieTargetResult, type FatPreference, type Goal, type MacroTargets } from './targets';

export interface NutritionProfileInput {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  /** onboarding weight, used until weigh-ins exist */
  weightKg: number;
  bodyFatPct?: number | null;
  lifestyle: Lifestyle;
  goal: Goal;
  ratePerWeek: number;
  fatPreference: FatPreference;
  /** planned training (from the program schedule) for the TDEE prior */
  weeklySessions: PlannedSession[];
}

export interface NutritionPlan {
  ageYears: number;
  trendKg: number;
  bmr: number;
  prior: number;
  tdee: number;
  /** 0–1: how much real intake + weight data shaped the TDEE */
  confidence: number;
  calibrating: boolean;
  validDays: number;
  target: CalorieTargetResult;
  macros: MacroTargets;
  /** §2.8 safety rule: 3 of the last 7 logged days were very low → supportive check-in, no deficit increases */
  lowIntake: boolean;
}

const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isoOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Whole years between birth date and the given ISO date. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/**
 * §2.8: the last 7 game days before today that count as eaten-and-logged (marked complete, or ≥ 2 meals),
 * fed to `needsLowIntakeCheckIn`. Partly logged days (one meal) are ignored so a forgotten dinner never trips it.
 */
export function lowIntakeCheck(intake: readonly IntakeDay[], today: string, bmrKcal: number): boolean {
  const t = dayNum(today);
  const days = intake
    .filter((d) => dayNum(d.date) >= t - 7 && dayNum(d.date) < t && (d.markedComplete || d.meals >= TDEE.validDayMinMeals))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => d.kcal);
  return needsLowIntakeCheckIn(days, bmrKcal);
}

/**
 * Builds today's targets. TDEE starts at the prior and is replayed day by day through the
 * recursive estimator (§2.3) over every day with data, so the result never depends on when
 * the app last ran.
 */
export function nutritionPlan(i: {
  profile: NutritionProfileInput;
  weighIns: readonly WeighIn[];
  intake: readonly IntakeDay[];
  today: string;
  lastWeekTarget?: number | null;
  /** hours trained today (water target +0.5 L/h, §2.5) */
  trainingHoursToday?: number;
}): NutritionPlan {
  const p = i.profile;
  const ageYears = ageOn(p.birthDate, i.today);
  const trend = computeTrend(i.weighIns.filter((w) => w.date <= i.today));
  const trendKg = trend.length ? trend[trend.length - 1]!.trend : p.weightKg;
  const body = { sex: p.sex, weightKg: trendKg, heightCm: p.heightCm, ageYears, bodyFatPct: p.bodyFatPct ?? null };
  const b = bmr(body);
  const prior = tdeePrior({ ...body, lifestyle: p.lifestyle, weeklySessions: p.weeklySessions });

  // replay the estimator from the first day with data up to yesterday
  let tdee = prior;
  let confidence = 0;
  let calibrating = true;
  let validDays = 0;
  const firstDates = [...i.intake.map((d) => d.date), ...i.weighIns.map((w) => w.date)].sort();
  const end = dayNum(i.today) - 1;
  if (firstDates.length) {
    const start = Math.max(dayNum(firstDates[0]!), end - 365);
    for (let d = start; d <= end; d++) {
      const from = d - TDEE.windowDays + 1;
      const inWindow = (iso: string) => dayNum(iso) >= from && dayNum(iso) <= d;
      const intake = i.intake.filter((x) => inWindow(x.date));
      const weighIns = i.weighIns.filter((w) => inWindow(w.date));
      const kcalTarget = calorieTarget({ tdee, bmr: b, sex: p.sex, ageYears, trendWeightKg: trendKg, heightCm: p.heightCm, goal: p.goal, ratePerWeek: p.ratePerWeek }).kcal;
      const r = updateTdee({ previousTdee: tdee, bmr: b, intake, kcalTarget, slopeKgPerDay: weightSlopePerDay(weighIns), weighInsInWindow: weighIns.length });
      tdee = r.tdee;
      confidence = r.confidence;
      calibrating = r.calibrating;
      validDays = r.validDays;
    }
  }

  const target = calorieTarget({
    tdee, bmr: b, sex: p.sex, ageYears, trendWeightKg: trendKg, heightCm: p.heightCm,
    goal: p.goal, ratePerWeek: p.ratePerWeek, lastWeekTarget: i.lastWeekTarget ?? null,
  });
  const macros = macroTargets({
    kcal: target.kcal, goal: p.goal, weightKg: trendKg, heightCm: p.heightCm, bodyFatPct: p.bodyFatPct ?? null, fatPreference: p.fatPreference,
    trainingHoursToday: i.trainingHoursToday ?? 0,
  });
  const lowIntake = lowIntakeCheck(i.intake, i.today, b);
  return { ageYears, trendKg, bmr: b, prior, tdee, confidence, calibrating, validDays, target, macros, lowIntake };
}

export type CheckInVerdict = 'insufficient' | 'onTrack' | 'faster' | 'slower';

export interface CheckIn {
  verdict: CheckInVerdict;
  validDays: number;
  observedKgPerWeek: number | null;
  goalKgPerWeek: number;
  message: string;
}

/**
 * Weekly check-in (§2.9). Supportive, never shaming. Uses 14 days of weigh-ins for the rate
 * and the last 7 intake days for adherence.
 */
export function weeklyCheckIn(i: {
  intake: readonly IntakeDay[];
  weighIns: readonly WeighIn[];
  kcalTarget: number;
  goal: Goal;
  ratePerWeek: number;
  trendKg: number;
  today: string;
}): CheckIn {
  const t = dayNum(i.today);
  const last7 = i.intake.filter((d) => dayNum(d.date) > t - 7 && dayNum(d.date) <= t);
  // same rule as the TDEE (§2.3): a complete day under 800 kcal only counts once the user confirmed it was a full day
  const validDays = last7.filter((d) => isValidIntakeDay(d, i.kcalTarget)).length;
  const goalKgPerWeek = (i.goal === 'cut' || i.goal === 'bulk' ? i.ratePerWeek : 0) * i.trendKg;
  const slope = weightSlopePerDay(i.weighIns.filter((w) => dayNum(w.date) > t - 14 && dayNum(w.date) <= t));
  if (validDays < 4 || slope == null) {
    return {
      verdict: 'insufficient', validDays, observedKgPerWeek: slope == null ? null : slope * 7, goalKgPerWeek,
      message: validDays < 4
        ? 'Not enough logged days this week, so your targets stay the same. Log 4+ days next week for a real update.'
        : 'Weigh in a few more mornings (5 over 10+ days) and the System can read your trend.',
    };
  }
  const observed = slope * 7;
  const tol = Math.max(0.15, 0.0025 * i.trendKg);
  const diff = observed - goalKgPerWeek;
  const verdict: CheckInVerdict = Math.abs(diff) <= tol ? 'onTrack' : (i.goal === 'bulk' ? diff > 0 : diff < 0) ? 'faster' : 'slower';
  const fmt = (kg: number) => `${kg >= 0 ? '+' : '−'}${Math.abs(kg).toFixed(2)} kg/week`;
  const message =
    verdict === 'onTrack'
      ? `Right on plan: ${fmt(observed)}. Targets stay steady. Keep doing exactly this.`
      : verdict === 'faster'
        ? `Moving faster than planned (${fmt(observed)} vs ${fmt(goalKgPerWeek)}). Your targets adjust gently; keep protein high to protect muscle.`
        : `A bit slower than planned (${fmt(observed)} vs ${fmt(goalKgPerWeek)}). Your targets adjust slightly. Water and logging gaps can hide progress, so stay consistent.`;
  return { verdict, validDays, observedKgPerWeek: observed, goalKgPerWeek, message };
}

export interface StoredTarget {
  effectiveFrom: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  goal: Goal;
  ratePerWeek: number;
}

export interface MacroOverride {
  proteinG?: number | null;
  fatG?: number | null;
}

/** Manual override (§2.5): the user fixes protein and/or fat; carbs fill the remaining kcal. */
export function applyMacroOverride(m: MacroTargets, o: MacroOverride = {}): MacroTargets {
  if (o.proteinG == null && o.fatG == null) return m;
  const proteinG = o.proteinG ?? m.proteinG;
  const fatG = o.fatG ?? m.fatG;
  return { ...m, proteinG, fatG, carbsG: Math.max(0, (m.kcal - 4 * proteinG - 9 * fatG) / 4) };
}

/**
 * Weekly targets: stable for 7 days, then recomputed with the ±150 kcal smoothing (§2.4 rail 4).
 * A goal or rate change takes effect immediately and skips smoothing.
 */
export function weeklyTargets(i: {
  profile: NutritionProfileInput;
  weighIns: readonly WeighIn[];
  intake: readonly IntakeDay[];
  today: string;
  latest: StoredTarget | null;
  override?: MacroOverride;
  trainingHoursToday?: number;
}): { plan: NutritionPlan; macros: MacroTargets; effectiveFrom: string; store: boolean } {
  const sameGoal = !!i.latest && i.latest.goal === i.profile.goal && i.latest.ratePerWeek === i.profile.ratePerWeek;
  const fresh = sameGoal && dayNum(i.today) - dayNum(i.latest!.effectiveFrom) < 7;
  let plan = nutritionPlan({ ...i, lastWeekTarget: sameGoal ? i.latest!.kcal : null });
  // §2.8: while intake has been very low, the deficit never deepens — keep at least last week's kcal
  if (plan.lowIntake && i.latest && plan.target.kcal < i.latest.kcal) {
    const p = i.profile;
    const kcal = i.latest.kcal;
    plan = {
      ...plan,
      target: { ...plan.target, kcal, appliedRails: [...plan.target.appliedRails, 'lowIntakePause'] },
      macros: macroTargets({
        kcal, goal: p.goal, weightKg: plan.trendKg, heightCm: p.heightCm, bodyFatPct: p.bodyFatPct ?? null, fatPreference: p.fatPreference,
        trainingHoursToday: i.trainingHoursToday ?? 0,
      }),
    };
  }
  if (fresh) {
    const l = i.latest!;
    const base: MacroTargets = { kcal: l.kcal, proteinG: l.proteinG, fatG: l.fatG, carbsG: l.carbsG, fiberG: l.fiberG, waterMl: plan.macros.waterMl };
    return { plan, macros: applyMacroOverride(base, i.override), effectiveFrom: l.effectiveFrom, store: false };
  }
  return { plan, macros: applyMacroOverride(plan.macros, i.override), effectiveFrom: i.today, store: true };
}

export { isoOf as isoFromDayNumber };
