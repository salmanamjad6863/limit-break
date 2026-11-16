/** Body metrics — SYSTEMS.md §1. Internal units: kg, cm. */
export type Sex = 'male' | 'female' | 'unspecified';

export const LB_TO_KG = 0.45359237;
export const IN_TO_CM = 2.54;
export const OZ_TO_G = 28.349523;
export const FL_OZ_TO_ML = 29.5735;

export const lbToKg = (lb: number) => lb * LB_TO_KG;
export const kgToLb = (kg: number) => kg / LB_TO_KG;
export const inToCm = (inch: number) => inch * IN_TO_CM;
export const cmToIn = (cm: number) => cm / IN_TO_CM;

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Lean body mass from body-fat percentage (0–100). */
export const leanBodyMass = (weightKg: number, bodyFatPct: number) =>
  weightKg * (1 - bodyFatPct / 100);

/**
 * Weight used for per-kg protein targets when lean mass is unknown (§1.2).
 * Above BMI 30 we use the weight at BMI 25 to avoid oversized targets.
 */
export function referenceWeight(weightKg: number, heightCm: number): number {
  if (bmi(weightKg, heightCm) >= 30) {
    const m = heightCm / 100;
    return 25 * m * m;
  }
  return weightKg;
}

/** US Navy body-fat estimate (§1.3). Inputs in cm; formula is defined in inches. Returns %. */
export function navyBodyFat(input: {
  sex: Exclude<Sex, 'unspecified'>;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm?: number;
}): number {
  const h = cmToIn(input.heightCm);
  const neck = cmToIn(input.neckCm);
  const waist = cmToIn(input.waistCm);
  if (input.sex === 'male') {
    return 86.01 * Math.log10(waist - neck) - 70.041 * Math.log10(h) + 36.76;
  }
  if (input.hipCm == null) throw new Error('hipCm is required for the female Navy formula');
  const hip = cmToIn(input.hipCm);
  return 163.205 * Math.log10(waist + hip - neck) - 97.684 * Math.log10(h) - 78.387;
}
