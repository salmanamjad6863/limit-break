/**
 * Achievements: tiered badges (bronze → platinum) earned from real activity, plus hidden ones.
 * Pure: the server (authoritative) and the phone (demo mode) evaluate the same stats the same way.
 * Earning a tier is permanent; stats that go down later (an edited workout) never take a badge back.
 */
import { addDays } from '../quests';
import { weekdayOf } from '../training/schedule';

export type AchievementMetric =
  | 'workouts' | 'tonnes' | 'prs' | 'routineWorkouts' | 'cardioMinutes' | 'streak' | 'dailyQuests' | 'challenges' | 'flawlessChallenges'
  | 'level' | 'rank' | 'trials' | 'bosses' | 'nutritionDays' | 'dawnWorkouts' | 'nightWorkouts' | 'fullWeekends' | 'longSessions' | 'comebacks';
export type AchievementStats = Record<AchievementMetric, number>;

export interface AchievementDefLike {
  id: string;
  metric: AchievementMetric;
  describe: string;
  hidden?: boolean;
  tiers: { at: number; label?: string; title?: string; text?: string }[];
}

export const TIER_NAMES = ['bronze', 'silver', 'gold', 'platinum'] as const;
export type TierName = (typeof TIER_NAMES)[number];
/** single-tier (hidden) achievements are gold */
export const tierName = (def: Pick<AchievementDefLike, 'tiers'>, i: number): TierName => (def.tiers.length === 1 ? 'gold' : TIER_NAMES[i] ?? 'platinum');
/** XP per tier earned; hidden ones pay a discovery bonus */
export const ACHIEVEMENT_XP = { bronze: 25, silver: 50, gold: 100, platinum: 250, hidden: 150 } as const;
export const tierXp = (def: AchievementDefLike, i: number) => (def.hidden ? ACHIEVEMENT_XP.hidden : ACHIEVEMENT_XP[tierName(def, i)]);
/** Essence (cosmetics currency, never XP or stats) per tier earned */
export const ACHIEVEMENT_ESSENCE = { bronze: 10, silver: 20, gold: 40, platinum: 80, hidden: 50 } as const;
export const tierEssence = (def: AchievementDefLike, i: number) => (def.hidden ? ACHIEVEMENT_ESSENCE.hidden : ACHIEVEMENT_ESSENCE[tierName(def, i)]);

export const RANK_INDEX: Record<string, number> = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 };

const fmt = (n: number) => (n >= 1000 ? n.toLocaleString('en-US') : String(n));
/** "Finish 25 workouts" / "Reach C-Rank" for a tier. */
export const describeTier = (def: AchievementDefLike, i: number) => {
  const t = def.tiers[Math.min(i, def.tiers.length - 1)]!;
  if (t.text) return t.text;
  return def.describe.replace('{n}', fmt(t.at)).replace('{label}', t.label ?? fmt(t.at));
};

export interface AchievementProgress {
  id: string;
  value: number;
  /** highest tier index reached by the stats right now (-1 none) */
  reached: number;
  /** highest tier index ever earned (kept even if stats drop) */
  earned: number;
  /** next threshold to earn, null when every tier is earned */
  next: number | null;
  /** 0–1 toward the next tier (from the previous one) */
  ratio: number;
}

export function evaluateAchievements(
  defs: readonly AchievementDefLike[],
  stats: Partial<AchievementStats>,
  /** achievement id → highest tier index already earned */
  earnedBefore: ReadonlyMap<string, number>,
): { progress: AchievementProgress[]; newUnlocks: { id: string; tier: number }[] } {
  const progress: AchievementProgress[] = [];
  const newUnlocks: { id: string; tier: number }[] = [];
  for (const d of defs) {
    const value = Math.max(0, stats[d.metric] ?? 0);
    let reached = -1;
    d.tiers.forEach((t, i) => { if (value >= t.at) reached = i; });
    const before = earnedBefore.get(d.id) ?? -1;
    for (let i = before + 1; i <= reached; i++) newUnlocks.push({ id: d.id, tier: i });
    const earned = Math.max(before, reached);
    const nextTier = d.tiers[earned + 1];
    const from = earned >= 0 ? d.tiers[earned]!.at : 0;
    const ratio = nextTier ? Math.min(1, Math.max(0, (value - from) / (nextTier.at - from))) : 1;
    progress.push({ id: d.id, value, reached, earned, next: nextTier?.at ?? null, ratio });
  }
  return { progress, newUnlocks };
}

/** Titles the hunter can wear: every tier earned that carries one. */
export function earnedTitles(defs: readonly AchievementDefLike[], earned: ReadonlyMap<string, number>): { title: string; achievementId: string; tier: number }[] {
  return defs.flatMap((d) => d.tiers.flatMap((t, i) => (t.title && i <= (earned.get(d.id) ?? -1) ? [{ title: t.title, achievementId: d.id, tier: i }] : [])));
}

/** The unearned achievement closest to its next tier (for a "next up" nudge); hidden ones are never hinted. */
export function closestAchievement(defs: readonly AchievementDefLike[], progress: readonly AchievementProgress[]): AchievementProgress | null {
  const visible = new Set(defs.filter((d) => !d.hidden).map((d) => d.id));
  return [...progress].filter((p) => visible.has(p.id) && p.next != null).sort((a, b) => b.ratio - a.ratio)[0] ?? null;
}

/* ---------------- workout timing (hidden achievements) ---------------- */

export interface TimedSession {
  startedAt: Date | string;
  finishedAt: Date | string | null;
  localDate: string;
}

function hourIn(at: Date, timeZone: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(at);
    return Number(h) % 24;
  } catch {
    return at.getUTCHours();
  }
}

/** Dawn (03:00–05:59), night (22:00–02:59), full weekends, 90-minute sessions, comebacks after 14+ days away. */
export function timingStats(sessions: readonly TimedSession[], timeZone: string): Pick<AchievementStats, 'dawnWorkouts' | 'nightWorkouts' | 'fullWeekends' | 'longSessions' | 'comebacks'> {
  let dawnWorkouts = 0;
  let nightWorkouts = 0;
  let longSessions = 0;
  for (const s of sessions) {
    const start = new Date(s.startedAt);
    const h = hourIn(start, timeZone);
    if (h >= 3 && h < 6) dawnWorkouts++;
    if (h >= 22 || h < 3) nightWorkouts++;
    if (s.finishedAt && new Date(s.finishedAt).getTime() - start.getTime() >= 90 * 60_000) longSessions++;
  }
  const dates = [...new Set(sessions.map((s) => s.localDate))].sort();
  const set = new Set(dates);
  const fullWeekends = dates.filter((d) => weekdayOf(d) === 6 && set.has(addDays(d, 1))).length;
  let comebacks = 0;
  for (let i = 1; i < dates.length; i++) {
    const gap = Math.round((Date.parse(`${dates[i]}T12:00:00Z`) - Date.parse(`${dates[i - 1]}T12:00:00Z`)) / 86_400_000);
    if (gap >= 15) comebacks++;
  }
  return { dawnWorkouts, nightWorkouts, fullWeekends, longSessions, comebacks };
}
