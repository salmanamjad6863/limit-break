/** Calorie target + macro split — SYSTEMS.md §2.4–2.5. */
import { bmi, leanBodyMass, referenceWeight, type Sex } from '../body';
import { KCAL_PER_KG, MACROS, TARGETS } from '../constants';

export type Goal = 'cut' | 'maintain' | 'recomp' | 'bulk';
export type FatPreference = keyof typeof MACROS.fatShare;

export interface CalorieTargetInput {
  tdee: number;
  bmr: number;
  sex: Sex;
  ageYears: number;
  trendWeightKg: number;
  heightCm: number;
  goal: Goal;
  /** fraction of bodyweight per week, e.g. −0.005 */
  ratePerWeek: number;
  /** last week's target; omit on first calculation or right after a goal change */
  lastWeekTarget?: number | null;
}

export interface CalorieTargetResult {
  kcal: number;
  delta: number;
  appliedRails: Array<'deficitCap' | 'floor' | 'under18' | 'weeklySmoothing' | 'maxCutBmi' | 'lowIntakePause'>;
}

/** Rates the UI may offer for a goal given the user's BMI and age. */
export function allowedRates(goal: Goal, input: { bmi: number; ageYears: number }): number[] {
  if (input.ageYears < 18 && goal === 'cut') return [];
  const rates = [...TARGETS.rates[goal]] as number[];
  if (goal === 'cut' && input.bmi < TARGETS.maxCutRequiresBmi) return rates.filter((r) => r > -0.01);
  return rates;
}

export function calorieTarget(i: CalorieTargetInput): CalorieTargetResult {
  const rails: CalorieTargetResult['appliedRails'] = [];
  let rate = i.goal === 'maintain' || i.goal === 'recomp' ? 0 : i.ratePerWeek;

  if (i.goal === 'cut' && rate <= -0.01 && bmi(i.trendWeightKg, i.heightCm) < TARGETS.maxCutRequiresBmi) {
    rate = -0.0075;
    rails.push('maxCutBmi');
  }
  let delta = (rate * i.trendWeightKg * KCAL_PER_KG) / 7;

  // 1. Deficit cap
  const maxDeficit = Math.min(TARGETS.maxDeficitShareOfTdee * i.tdee, TARGETS.maxDeficitKcal);
  if (delta < -maxDeficit) {
    delta = -maxDeficit;
    rails.push('deficitCap');
  }
  // 3. Under 18 — no deficit (checked before floor so the floor reflects the final delta)
  if (i.ageYears < 18 && delta < 0) {
    delta = 0;
    rails.push('under18');
  }
  let kcal = i.tdee + delta;

  // 2. Floor
  const floor = Math.max(i.bmr, TARGETS.floorKcal[i.sex]);
  if (kcal < floor) {
    kcal = floor;
    rails.push('floor');
  }
  // 4. Weekly smoothing
  if (i.lastWeekTarget != null) {
    const max = TARGETS.weeklyMaxChangeKcal;
    const change = kcal - i.lastWeekTarget;
    if (Math.abs(change) > max) {
      kcal = Math.max(floor, i.lastWeekTarget + Math.sign(change) * max);
      rails.push('weeklySmoothing');
    }
  }
  return { kcal, delta: kcal - i.tdee, appliedRails: rails };
}

export interface MacroInput {
  kcal: number;
  goal: Goal;
  weightKg: number;
  heightCm: number;
  bodyFatPct?: number | null;
  fatPreference?: FatPreference;
  keto?: boolean;
  trainingHoursToday?: number;
}

export interface MacroTargets {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  waterMl: number;
}

export function macroTargets(i: MacroInput): MacroTargets {
  const { kcalPerG } = MACROS;
  const refW = referenceWeight(i.weightKg, i.heightCm);
  const minProtein = MACROS.proteinMinPerKg * refW;

  let protein =
    i.bodyFatPct != null
      ? MACROS.proteinPerKgLbm[i.goal] * leanBodyMass(i.weightKg, i.bodyFatPct)
      : MACROS.proteinPerKg[i.goal] * refW;
  const proteinCap = (MACROS.proteinMaxKcalShare * i.kcal) / kcalPerG.protein;
  if (protein > proteinCap) protein = Math.max(proteinCap, minProtein);
  protein = Math.max(protein, minProtein);

  const fatFloor = MACROS.fatMinPerKg * i.weightKg;
  const share = MACROS.fatShare[i.fatPreference ?? 'balanced'];
  let fat = Math.max(fatFloor, (share * i.kcal) / kcalPerG.fat);

  const carbsFor = (f: number) => (i.kcal - kcalPerG.protein * protein - kcalPerG.fat * f) / kcalPerG.carbs;
  let carbs = carbsFor(fat);
  if (carbs < MACROS.minCarbsG && !i.keto) {
    // lower fat toward its floor to make room for carbs
    const needed = ((MACROS.minCarbsG - carbs) * kcalPerG.carbs) / kcalPerG.fat;
    fat = Math.max(fatFloor, fat - needed);
    carbs = carbsFor(fat);
  }
  carbs = Math.max(0, carbs);

  return {
    kcal: i.kcal,
    proteinG: protein,
    fatG: fat,
    carbsG: carbs,
    fiberG: (MACROS.fiberPer1000Kcal * i.kcal) / 1000,
    waterMl: MACROS.waterMlPerKg * i.weightKg + MACROS.waterMlPerTrainingHour * (i.trainingHoursToday ?? 0),
  };
}
