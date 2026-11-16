/** Global community math — SYSTEMS.md §5.1–5.2. */

export const BOARD_RULES = {
  minPlannedSessions: 8,
  improvementMinDaysBetweenTests: 21,
  improvementMaxPointsPerStat: 15,
  anomalyZ: 3,
} as const;

/** Most Consistent: 100 × (0.6·sessions + 0.4·quest days). Null when not eligible. */
export function consistencyScore(i: {
  sessionsDone: number;
  sessionsPlanned: number;
  questDays: number;
  daysInMonth: number;
}): number | null {
  if (i.sessionsPlanned < BOARD_RULES.minPlannedSessions) return null;
  const s = Math.min(1, i.sessionsDone / i.sessionsPlanned);
  const q = Math.min(1, i.questDays / i.daysInMonth);
  return 100 * (0.6 * s + 0.4 * q);
}

export type StatKey = 'STR' | 'AGI' | 'END' | 'VIT' | 'SPI';
export interface StatTest {
  /** ISO date of the test */
  date: string;
  /** 0–100 stat scores at that test */
  stats: Record<StatKey, number>;
}

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/**
 * Most Improved: % gain in summed re-tested stats (a Power Level proxy), from the first test of the
 * month (or the last one before it) to the latest test at least 21 days later. Each stat's gain is
 * capped at +15 points so a deliberately weak first test can't win.
 */
export function improvementScore(baseline: StatTest | null, latest: StatTest | null): number | null {
  if (!baseline || !latest) return null;
  if (days(baseline.date, latest.date) < BOARD_RULES.improvementMinDaysBetweenTests) return null;
  const keys = Object.keys(baseline.stats) as StatKey[];
  const start = keys.reduce((s, k) => s + baseline.stats[k], 0);
  if (start <= 0) return null;
  const gain = keys.reduce(
    (s, k) => s + Math.max(-100, Math.min(BOARD_RULES.improvementMaxPointsPerStat, latest.stats[k] - baseline.stats[k])),
    0,
  );
  return (100 * gain) / start;
}

/**
 * Day flagged for review when its XP is > 3σ above the user's own 30-day history.
 * σ has a floor of max(15% of the mean, 30 XP) so very consistent users aren't flagged
 * for an ordinary bigger session.
 */
export function isXpAnomaly(todayXp: number, last30: readonly number[]): boolean {
  if (last30.length < 7) return false;
  const mean = last30.reduce((s, x) => s + x, 0) / last30.length;
  const rawSd = Math.sqrt(last30.reduce((s, x) => s + (x - mean) ** 2, 0) / last30.length);
  const sd = Math.max(rawSd, 0.15 * mean, 30);
  return (todayXp - mean) / sd > BOARD_RULES.anomalyZ;
}

/** Global feed ranking: (respect + 2·comments + 3·shares) / (ageHours + 2)^1.5. */
export function hotScore(p: { respect: number; comments: number; shares: number; ageHours: number }): number {
  return (p.respect + 2 * p.comments + 3 * p.shares) / (Math.max(0, p.ageHours) + 2) ** 1.5;
}

/** Competition ranking with ties: [100, 90, 90, 80] → [1, 2, 2, 4]. */
export function rankScores(scores: readonly number[]): number[] {
  const sorted = [...scores].sort((a, b) => b - a);
  return scores.map((s) => sorted.indexOf(s) + 1);
}

export type TrustLevel = 0 | 1 | 2 | 3;

/** SYSTEMS.md §5.4 */
export function trustLevel(i: {
  accountDays: number;
  workoutsLogged: number;
  level: number;
  upheldReports90d: number;
}): TrustLevel {
  if (i.accountDays >= 60 && i.level >= 25 && i.upheldReports90d === 0) return 3;
  if (i.accountDays >= 14 && i.level >= 10 && i.upheldReports90d === 0) return 2;
  if (i.accountDays >= 3 && i.workoutsLogged >= 3) return 1;
  return 0;
}

/** Global boards: 18+, signed in, account ≥ 14 days, public profile, no upheld cheat flag this month. */
export function boardEligible(i: {
  ageYears: number;
  isGuest: boolean;
  accountDays: number;
  publicProfile: boolean;
  cheatFlagThisMonth: boolean;
}): boolean {
  return i.ageYears >= 18 && !i.isGuest && i.accountDays >= 14 && i.publicProfile && !i.cheatFlagThisMonth;
}
