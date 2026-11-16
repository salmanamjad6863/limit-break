/** BMR, starting TDEE and adaptive TDEE — SYSTEMS.md §2.1–2.3. */
import { leanBodyMass, type Sex } from '../body';
import { KCAL_PER_KG, LIFESTYLE_FACTOR, MET, TDEE } from '../constants';
import { clamp, mean } from '../math';

export type Lifestyle = keyof typeof LIFESTYLE_FACTOR;

export interface BmrInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  bodyFatPct?: number | null;
}

/** Katch-McArdle when body fat is known, otherwise Mifflin-St Jeor (midpoint constant if sex unspecified). */
export function bmr(i: BmrInput): number {
  if (i.bodyFatPct != null) return 370 + 21.6 * leanBodyMass(i.weightKg, i.bodyFatPct);
  const base = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.ageYears;
  const k = i.sex === 'male' ? 5 : i.sex === 'female' ? -161 : -78;
  return base + k;
}

export type SessionKind = 'strength' | 'calisthenics' | 'cyclingModerate' | 'running';

export interface PlannedSession {
  kind: SessionKind;
  minutes: number;
  /** required for running */
  speedKmh?: number;
}

export function sessionMet(s: PlannedSession): number {
  if (s.kind === 'running') {
    if (s.speedKmh == null) throw new Error('running sessions need speedKmh');
    return s.speedKmh * MET.runningPerKmh;
  }
  return MET[s.kind];
}

/** Net exercise energy averaged per day: Σ (MET − 1) × kg × hours / 7. */
export function exerciseKcalPerDay(weightKg: number, weeklySessions: readonly PlannedSession[]): number {
  const weekly = weeklySessions.reduce(
    (sum, s) => sum + (sessionMet(s) - 1) * weightKg * (s.minutes / 60),
    0,
  );
  return weekly / 7;
}

/** Starting TDEE (prior): BMR × lifestyle + planned exercise. */
export function tdeePrior(input: BmrInput & { lifestyle: Lifestyle; weeklySessions: PlannedSession[] }) {
  return bmr(input) * LIFESTYLE_FACTOR[input.lifestyle] + exerciseKcalPerDay(input.weightKg, input.weeklySessions);
}

export interface IntakeDay {
  date: string;
  kcal: number;
  meals: number;
  /** user explicitly tapped "complete day" */
  markedComplete: boolean;
  /** user confirmed a very low complete day is real (only consulted when kcal < 800) */
  lowDayConfirmed?: boolean;
}

/** A day counts toward TDEE if marked complete, or ≥2 meals and ≥60% of the target (§2.3). */
export function isValidIntakeDay(d: IntakeDay, kcalTarget: number): boolean {
  if (d.markedComplete) {
    return d.kcal >= TDEE.suspiciousCompleteDayKcal || d.lowDayConfirmed === true;
  }
  return d.meals >= TDEE.validDayMinMeals && d.kcal >= TDEE.validDayMinTargetShare * kcalTarget;
}

/** TDEE_obs = mean intake − ρ × slope (slope in kg/day). */
export function observedTdee(meanIntakeKcal: number, slopeKgPerDay: number): number {
  return meanIntakeKcal - KCAL_PER_KG * slopeKgPerDay;
}

export function tdeeConfidence(validDays: number, weighIns: number): number {
  return (
    Math.min(1, validDays / TDEE.fullConfidenceValidDays) *
    Math.min(1, weighIns / TDEE.fullConfidenceWeighIns)
  );
}

export interface TdeeUpdateInput {
  previousTdee: number;
  bmr: number;
  /** intake days inside the window */
  intake: readonly IntakeDay[];
  kcalTarget: number;
  /** OLS slope over the window, or null if insufficient (§1.4) */
  slopeKgPerDay: number | null;
  weighInsInWindow: number;
}

export interface TdeeUpdateResult {
  tdee: number;
  confidence: number;
  observed: number | null;
  validDays: number;
  calibrating: boolean;
}

/** One daily step of the recursive estimator: TDEE_t = TDEE_{t−1} + 0.1·c·(obs − TDEE_{t−1}). */
export function updateTdee(i: TdeeUpdateInput): TdeeUpdateResult {
  const valid = i.intake.filter((d) => isValidIntakeDay(d, i.kcalTarget));
  const validDays = valid.length;
  const clampTdee = (x: number) => clamp(x, i.bmr * TDEE.minBmrMultiple, i.bmr * TDEE.maxBmrMultiple);

  if (validDays < TDEE.minUsableDays || i.slopeKgPerDay == null) {
    return { tdee: clampTdee(i.previousTdee), confidence: 0, observed: null, validDays, calibrating: true };
  }
  const observed = observedTdee(mean(valid.map((d) => d.kcal)), i.slopeKgPerDay);
  const confidence = tdeeConfidence(validDays, i.weighInsInWindow);
  const tdee = clampTdee(i.previousTdee + TDEE.learningRate * confidence * (observed - i.previousTdee));
  return { tdee, confidence, observed, validDays, calibrating: false };
}
