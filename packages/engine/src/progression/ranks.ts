/** Ranks, stats and power level — SYSTEMS.md §4.3–4.4. */
import { interpolate } from '../math';

export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_REQUIREMENTS: Record<Exclude<Rank, 'E'>, { level: number; composite: number; minEvent: number }> = {
  D: { level: 10, composite: 30, minEvent: 10 },
  C: { level: 25, composite: 50, minEvent: 30 },
  B: { level: 40, composite: 70, minEvent: 50 },
  A: { level: 60, composite: 85, minEvent: 65 },
  S: { level: 80, composite: 95, minEvent: 75 },
};

export const nextRank = (r: Rank): Exclude<Rank, 'E'> | null =>
  (RANKS[RANKS.indexOf(r) + 1] as Exclude<Rank, 'E'> | undefined) ?? null;

export type HeroClass = 'HYBRID' | 'FIGHTER' | 'ASSASSIN' | 'JUGGERNAUT' | 'RANGER' | 'MONK';
export type TrialStat = 'STR' | 'END' | 'AGI';

export const CLASS_TRIAL_WEIGHTS: Record<HeroClass, Record<TrialStat, number>> = {
  FIGHTER: { STR: 0.5, END: 0.25, AGI: 0.25 },
  JUGGERNAUT: { STR: 0.4, END: 0.4, AGI: 0.2 },
  ASSASSIN: { STR: 0.3, END: 0.4, AGI: 0.3 },
  RANGER: { STR: 0.15, END: 0.25, AGI: 0.6 },
  MONK: { STR: 0.25, END: 0.5, AGI: 0.25 },
  HYBRID: { STR: 0.34, END: 0.33, AGI: 0.33 },
};

export interface TrialEventResult {
  stat: TrialStat;
  percentile: number;
}

/**
 * Composite = Σ classWeight[stat] × mean percentile of that stat's events.
 * Weights are renormalized over the stats that actually have events.
 */
export function trialComposite(heroClass: HeroClass, events: readonly TrialEventResult[]): number {
  const weights = CLASS_TRIAL_WEIGHTS[heroClass];
  const byStat = new Map<TrialStat, number[]>();
  for (const e of events) byStat.set(e.stat, [...(byStat.get(e.stat) ?? []), e.percentile]);
  let wSum = 0;
  let total = 0;
  for (const [stat, ps] of byStat) {
    const w = weights[stat];
    wSum += w;
    total += w * (ps.reduce((s, p) => s + p, 0) / ps.length);
  }
  return wSum > 0 ? total / wSum : 0;
}

export function evaluateTrial(input: {
  target: Exclude<Rank, 'E'>;
  level: number;
  heroClass: HeroClass;
  events: readonly TrialEventResult[];
}): { passed: boolean; composite: number; reasons: string[] } {
  const req = RANK_REQUIREMENTS[input.target];
  const composite = trialComposite(input.heroClass, input.events);
  const reasons: string[] = [];
  if (input.level < req.level) reasons.push(`level ${req.level} required`);
  if (composite < req.composite) reasons.push(`composite ${req.composite} required`);
  if (input.events.some((e) => e.percentile < req.minEvent)) reasons.push(`every event ≥ ${req.minEvent}`);
  return { passed: reasons.length === 0, composite, reasons };
}

/** Norm table anchors: percentile → raw value (ascending raw value). Lower-is-better metrics pass inverted=true. */
export interface NormAnchors {
  anchors: readonly { percentile: number; value: number }[];
  lowerIsBetter?: boolean;
}

/** Percentile (0–100) for a raw test value by piecewise-linear interpolation (§4.3). */
export function percentileFromNorms(value: number, norms: NormAnchors): number {
  const pts = norms.anchors
    .map((a) => ({ x: norms.lowerIsBetter ? -a.value : a.value, y: a.percentile }))
    .sort((a, b) => a.x - b.x);
  const x = norms.lowerIsBetter ? -value : value;
  // extend to 0/100 at the ends so values beyond anchors still saturate sensibly
  return Math.max(0, Math.min(100, interpolate(pts, x)));
}

export const strengthAgeFactor = (ageYears: number) => Math.min(1.4, 1 + 0.01 * Math.max(0, ageYears - 35));

export interface Stats {
  STR: number;
  AGI: number;
  END: number;
  VIT: number;
  SPI: number;
}

export const displayStat = (score: number) => Math.round(score * 10);

export const powerLevel = (s: Stats, level: number) =>
  Math.round((s.STR + s.AGI + s.END + s.VIT + s.SPI) * 10 * (1 + level / 100));

/** Detraining: hold 4 weeks, then −1%/week, floor at 50% of peak. */
export function decayedStat(peak: number, weeksSinceData: number): number {
  const decayWeeks = Math.max(0, weeksSinceData - 4);
  return Math.max(peak * 0.5, peak * (1 - 0.01 * decayWeeks));
}

/** SPI (§4.3): renormalizes when nutrition tracking is off. Inputs are 0–1 rates. */
export function spiScore(i: { questRate: number; sessionRate: number; loggingRate?: number | null }): number {
  if (i.loggingRate == null) return (100 * (0.5 * i.questRate + 0.3 * i.sessionRate)) / 0.8;
  return 100 * (0.5 * i.questRate + 0.3 * i.sessionRate + 0.2 * i.loggingRate);
}
