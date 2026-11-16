/** Weight trend + rate of change — SYSTEMS.md §1.4. */
import { TREND } from '../constants';
import { DAY_MS, mean, olsSlope } from '../math';

export interface WeighIn {
  /** ISO date (YYYY-MM-DD) of the game day */
  date: string;
  kg: number;
}

export interface TrendPoint extends WeighIn {
  trend: number;
  /** true when the point was an outlier the user confirmed (smoothed at half strength) */
  outlier: boolean;
}

const dayIndex = (isoDate: string) => Math.round(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);

/** Earliest weigh-in per day, sorted ascending. Input order within a day = chronological. */
export function dedupeDaily(weighIns: readonly WeighIn[]): WeighIn[] {
  const byDay = new Map<string, WeighIn>();
  for (const w of weighIns) if (!byDay.has(w.date)) byDay.set(w.date, w);
  return [...byDay.values()].sort((a, b) => dayIndex(a.date) - dayIndex(b.date));
}

export function isOutlier(kg: number, trendPrev: number): boolean {
  return Math.abs(kg - trendPrev) > Math.max(TREND.outlierAbsKg, TREND.outlierPct * trendPrev);
}

/**
 * Gap-aware EMA. α_eff = 1 − (1 − α)^gapDays.
 * Outliers are assumed user-confirmed by the time they reach the engine; they get half-strength α.
 */
export function computeTrend(weighIns: readonly WeighIn[]): TrendPoint[] {
  const days = dedupeDaily(weighIns);
  if (days.length === 0) return [];
  const seed = mean(days.slice(0, 3).map((d) => d.kg));
  const out: TrendPoint[] = [];
  let trend = seed;
  let prevDay = dayIndex(days[0]!.date);
  days.forEach((w, i) => {
    let outlier = false;
    if (i > 0) {
      const gap = Math.max(1, dayIndex(w.date) - prevDay);
      let alphaEff = 1 - (1 - TREND.alpha) ** gap;
      outlier = isOutlier(w.kg, trend);
      if (outlier) alphaEff *= TREND.outlierAlphaScale;
      trend = trend + alphaEff * (w.kg - trend);
      prevDay = dayIndex(w.date);
    }
    out.push({ ...w, trend, outlier });
  });
  return out;
}

/**
 * OLS slope of raw weigh-ins (kg/day) over the given points.
 * Returns null when there is not enough data (≥5 weigh-ins spanning ≥10 days).
 */
export function weightSlopePerDay(weighIns: readonly WeighIn[]): number | null {
  const days = dedupeDaily(weighIns);
  if (days.length < TREND.minWeighInsForSlope) return null;
  const span = dayIndex(days[days.length - 1]!.date) - dayIndex(days[0]!.date);
  if (span < TREND.minDaysForSlope) return null;
  const slope = olsSlope(days.map((d) => ({ x: dayIndex(d.date), y: d.kg })));
  return Number.isFinite(slope) ? slope : null;
}
