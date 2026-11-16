/** Training math — SYSTEMS.md §3. */
import { XP } from '../constants';
import { clamp } from '../math';

export interface LoggedSet {
  reps: number;
  /** kg on the bar/dumbbell, or added weight for bodyweight moves */
  loadKg: number;
  rir?: number | null;
  rpe?: number | null;
  isWarmup?: boolean;
}

/** Effective load for bodyweight exercises: bodyweight × bwFactor + added weight. */
export const bodyweightLoad = (bodyweightKg: number, bwFactor: number, addedKg = 0) =>
  bodyweightKg * bwFactor + addedKg;

export const repsToFailure = (reps: number, rir?: number | null) => reps + (rir ?? 0);

/** e1RM: mean(Epley, Brzycki) up to 10 reps-to-failure, Epley alone at 11–12, null beyond. */
export function e1rm(loadKg: number, reps: number, rir?: number | null): number | null {
  const r = repsToFailure(reps, rir);
  if (r < 1 || r > 12 || loadKg <= 0) return null;
  const epley = loadKg * (1 + r / 30);
  if (r > 10) return epley;
  const brzycki = (loadKg * 36) / (37 - r);
  return (epley + brzycki) / 2;
}

/** Inverse Epley: fraction of 1RM for a reps+RIR target, e.g. 5 @ RIR2 → 0.811. */
export const pct1rm = (reps: number, rir: number) => 1 / (1 + (reps + rir) / 30);

/** Hard set: not a warm-up and RIR ≤ 4 (or RPE ≥ 6, or effort not logged). */
export function isHardSet(s: LoggedSet): boolean {
  if (s.isWarmup) return false;
  if (s.rir != null) return s.rir <= XP.hardSetMaxRir;
  if (s.rpe != null) return s.rpe >= 6;
  return true;
}

export const volumeLoad = (sets: readonly LoggedSet[]) =>
  sets.filter((s) => !s.isWarmup).reduce((sum, s) => sum + s.loadKg * s.reps, 0);

/** Weekly sets per muscle: primary 1.0, secondary 0.5. */
export function setsPerMuscle(
  hardSets: readonly { primary: readonly string[]; secondary: readonly string[] }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of hardSets) {
    for (const m of s.primary) out[m] = (out[m] ?? 0) + 1;
    for (const m of s.secondary) out[m] = (out[m] ?? 0) + 0.5;
  }
  return out;
}

export type BodyRegion = 'upper' | 'lower';

/** Double progression decision for one exercise after a session (§3.3). */
export function doubleProgression(input: {
  repRange: [lo: number, hi: number];
  workingSets: readonly LoggedSet[];
  currentLoadKg: number;
  region: BodyRegion;
  /** sessions in a row (including this one) with a set below lo */
  sessionsBelowLo: number;
  roundTo?: (kg: number) => number;
}): { action: 'increase' | 'decrease' | 'hold'; nextLoadKg: number } {
  const [lo, hi] = input.repRange;
  const round = input.roundTo ?? ((kg: number) => Math.round(kg / 1.25) * 1.25);
  const allTop = input.workingSets.every((s) => s.reps >= hi && (s.rir == null || s.rir >= 1));
  if (input.workingSets.length > 0 && allTop) {
    const inc =
      input.region === 'upper'
        ? Math.max(2.5, input.currentLoadKg * 0.05)
        : Math.max(5, input.currentLoadKg * 0.05);
    return { action: 'increase', nextLoadKg: round(input.currentLoadKg + inc) };
  }
  if (input.sessionsBelowLo >= 2 && input.workingSets.some((s) => s.reps < lo)) {
    return { action: 'decrease', nextLoadKg: round(input.currentLoadKg * 0.9) };
  }
  return { action: 'hold', nextLoadKg: input.currentLoadKg };
}

/** Warm-up ramp (§3.6). */
export function warmupSets(workingKg: number, roundTo = 2.5): { kg: number; reps: number }[] {
  const r = (kg: number) => Math.round(kg / roundTo) * roundTo;
  if (workingKg >= 40) return [ { kg: r(workingKg * 0.4), reps: 5 }, { kg: r(workingKg * 0.6), reps: 3 }, { kg: r(workingKg * 0.8), reps: 1 } ];
  if (workingKg >= 20) return [{ kg: r(workingKg * 0.5), reps: 5 }];
  return [];
}

/**
 * Plate calculator: greedy per side, largest first. `plates` = available plate sizes (kg) with
 * count PER SIDE. Returns the closest achievable load ≤ target.
 */
export function plateLoadout(
  targetKg: number,
  barKg: number,
  plates: readonly { kg: number; perSide: number }[],
): { perSide: number[]; totalKg: number; exact: boolean } {
  let remaining = Math.max(0, (targetKg - barKg) / 2);
  const perSide: number[] = [];
  for (const p of [...plates].sort((a, b) => b.kg - a.kg)) {
    let n = p.perSide;
    while (n > 0 && remaining + 1e-9 >= p.kg) {
      perSide.push(p.kg);
      remaining -= p.kg;
      n--;
    }
  }
  const totalKg = barKg + 2 * perSide.reduce((s, x) => s + x, 0);
  return { perSide, totalKg, exact: Math.abs(totalKg - targetKg) < 1e-6 };
}

export type RestType = 'mainCompound' | 'secondaryCompound' | 'accessory' | 'isolation';
export const REST_SECONDS: Record<RestType, number> = {
  mainCompound: 150,
  secondaryCompound: 120,
  accessory: 75,
  isolation: 60,
};

/** Session duration estimate in minutes: 5 + Σ (reps×3 s + rest)/60. */
export function estimateSessionMinutes(sets: readonly { reps: number; restType: RestType }[]): number {
  return 5 + sets.reduce((sum, s) => sum + (s.reps * 3 + REST_SECONDS[s.restType]) / 60, 0);
}

/** Tanaka HRmax. */
export const hrMax = (ageYears: number) => 208 - 0.7 * ageYears;

export type Zone = 1 | 2 | 3 | 4 | 5;
const ZONE_LOWER_PCT: Record<Zone, number> = { 1: 0.5, 2: 0.6, 3: 0.7, 4: 0.8, 5: 0.9 };

/** Zone from heart rate: Karvonen if resting HR known, else % of HRmax. Below Z1 → 1. */
export function hrZone(hr: number, ageYears: number, restingHr?: number | null): Zone {
  const max = hrMax(ageYears);
  const pct = restingHr != null ? (hr - restingHr) / (max - restingHr) : hr / max;
  const zones: Zone[] = [5, 4, 3, 2, 1];
  return zones.find((z) => pct >= ZONE_LOWER_PCT[z]) ?? 1;
}

/** Zone from session RPE when no HR data. */
export function rpeZone(rpe: number): Zone {
  if (rpe <= 3) return 1;
  if (rpe <= 5) return 2;
  if (rpe <= 6) return 3;
  if (rpe <= 8) return 4;
  return 5;
}

/** Readiness 0–100 (§3.5). Missing inputs are dropped and weights renormalized. */
export function readiness(i: {
  hoursSlept?: number | null;
  energy?: number | null; // 1–5
  soreness?: number | null; // 1–5
  hrvToday?: number | null;
  hrvMean30?: number | null;
  hrvSd30?: number | null;
}): number | null {
  const parts: { w: number; v: number }[] = [];
  if (i.hoursSlept != null) parts.push({ w: 0.35, v: clamp((i.hoursSlept - 4) / 3, 0, 1) });
  if (i.energy != null) parts.push({ w: 0.25, v: (i.energy - 1) / 4 });
  if (i.soreness != null) parts.push({ w: 0.2, v: (5 - i.soreness) / 4 });
  if (i.hrvToday != null && i.hrvMean30 != null && i.hrvSd30 != null && i.hrvSd30 > 0) {
    parts.push({ w: 0.2, v: clamp(0.5 + (i.hrvToday - i.hrvMean30) / (2 * i.hrvSd30), 0, 1) });
  }
  if (parts.length === 0) return null;
  const wSum = parts.reduce((s, p) => s + p.w, 0);
  return (100 * parts.reduce((s, p) => s + p.w * p.v, 0)) / wSum;
}

/** VO2max estimates (§4.3 AGI). */
export const vo2FromRun2400m = (minutes: number) => 483 / minutes + 3.5;
export const vo2FromCooper12min = (metres: number) => (metres - 504.9) / 44.73;
