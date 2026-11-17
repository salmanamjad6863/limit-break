/** Food math, adherence and safety — SYSTEMS.md §2.7–2.8. */
import { ADHERENCE, MACROS } from '../constants';

export interface Per100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  alcohol?: number;
  fiber?: number;
}

export interface Nutrients extends Per100g {}

export function nutrientsForGrams(per100: Per100g, grams: number): Nutrients {
  const f = grams / 100;
  return {
    kcal: per100.kcal * f,
    protein: per100.protein * f,
    carbs: per100.carbs * f,
    fat: per100.fat * f,
    alcohol: (per100.alcohol ?? 0) * f,
    fiber: (per100.fiber ?? 0) * f,
  };
}

export const mlToGrams = (ml: number, densityGPerMl = 1) => ml * densityGPerMl;

export function kcalFromMacros(n: Omit<Per100g, 'kcal'>): number {
  const k = MACROS.kcalPerG;
  return k.protein * n.protein + k.carbs * n.carbs + k.fat * n.fat + k.alcohol * (n.alcohol ?? 0);
}

/** True when label kcal and macro-derived kcal disagree by more than 15%. */
export function labelLooksOff(per100: Per100g): boolean {
  if (per100.kcal <= 0) return false;
  return Math.abs(per100.kcal - kcalFromMacros(per100)) / per100.kcal > MACROS.labelMismatchTolerance;
}

export function sumNutrients(items: readonly Nutrients[]): Nutrients {
  return items.reduce<Nutrients>(
    (acc, n) => ({
      kcal: acc.kcal + n.kcal,
      protein: acc.protein + n.protein,
      carbs: acc.carbs + n.carbs,
      fat: acc.fat + n.fat,
      alcohol: (acc.alcohol ?? 0) + (n.alcohol ?? 0),
      fiber: (acc.fiber ?? 0) + (n.fiber ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, alcohol: 0, fiber: 0 },
  );
}

/** Recipe nutrients per 100 g of the cooked dish. */
export function recipePer100gCooked(ingredients: readonly Nutrients[], cookedWeightG: number): Nutrients {
  const total = sumNutrients(ingredients);
  return nutrientsForGrams(
    {
      kcal: (total.kcal / cookedWeightG) * 100,
      protein: (total.protein / cookedWeightG) * 100,
      carbs: (total.carbs / cookedWeightG) * 100,
      fat: (total.fat / cookedWeightG) * 100,
      alcohol: ((total.alcohol ?? 0) / cookedWeightG) * 100,
      fiber: ((total.fiber ?? 0) / cookedWeightG) * 100,
    },
    100,
  );
}

export const proteinAdherence = (eatenG: number, targetG: number) =>
  targetG <= 0 ? 1 : Math.min(1, eatenG / targetG);

export const proteinHit = (eatenG: number, targetG: number) =>
  proteinAdherence(eatenG, targetG) >= ADHERENCE.proteinHit;

export function kcalOnTarget(eaten: number, target: number): boolean {
  return Math.abs(eaten - target) <= Math.max(ADHERENCE.kcalToleranceKcal, ADHERENCE.kcalTolerancePct * target);
}

/**
 * Low-intake safety check (§2.8): 3 of the last 7 complete days below max(1000, 0.5 × BMR)
 * → show a supportive check-in and pause deficit increases.
 */
export function needsLowIntakeCheckIn(last7DaysKcal: readonly number[], bmrKcal: number): boolean {
  const threshold = Math.max(1000, 0.5 * bmrKcal);
  return last7DaysKcal.slice(-7).filter((k) => k < threshold).length >= 3;
}
