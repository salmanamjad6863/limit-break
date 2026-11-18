/**
 * Friends / guilds / raids / leagues math — SYSTEMS.md §5.6.
 * Pure functions so the API and tests share one source of truth.
 */

export const RAID = {
  /** floor for brand-new members with little history */
  minExpectedWeeklyXp: 800,
  /** boss HP = this × Σ expected weekly XP of active members */
  hpFactor: 0.8,
  /** Contribution% needed to earn raid loot */
  lootContribution: 0.25,
  /** member must have been active within this many days to count toward HP */
  activeDays: 14,
} as const;

export const DUEL = {
  days: 7,
  /** floor so a brand-new hunter isn't divided by ~0 */
  minBaselineWeeklyXp: 200,
} as const;

export const LEAGUE = {
  size: 30,
  promote: 7,
  demote: 5,
  tiers: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Mythic'] as const,
} as const;

export type LeagueTier = (typeof LEAGUE.tiers)[number];

/** Mean weekly XP over up to 4 recent weeks; floors at the raid/duel minimum. */
export function expectedWeeklyXp(weeklyTotals: readonly number[], floor = RAID.minExpectedWeeklyXp): number {
  const weeks = weeklyTotals.slice(0, 4);
  if (!weeks.length) return floor;
  const mean = weeks.reduce((s, x) => s + x, 0) / weeks.length;
  return Math.max(floor, Math.round(mean));
}

/** Boss HP for a Monday open: 0.8 × Σ E_i over members active in the last 14 days. */
export function raidBossHp(memberExpected: readonly number[]): number {
  const sum = memberExpected.reduce((s, e) => s + e, 0);
  return Math.max(1, Math.round(RAID.hpFactor * sum));
}

/** Effort board: damage / own expected. Caps display at a sane upper bound for the bar. */
export function raidContribution(damageXp: number, expectedXp: number): number {
  const e = Math.max(1, expectedXp);
  return damageXp / e;
}

export function raidCleared(totalDamage: number, bossHp: number): boolean {
  return totalDamage >= bossHp;
}

export function earnsRaidLoot(contribution: number): boolean {
  return contribution >= RAID.lootContribution;
}

/** Duel score = XP this week / own 4-week average weekly XP. */
export function duelScore(weekXp: number, baselineWeeklyXp: number): number {
  return weekXp / Math.max(DUEL.minBaselineWeeklyXp, baselineWeeklyXp);
}

export type DuelOutcome = 'challenger' | 'opponent' | 'draw';

export function duelWinner(a: { weekXp: number; baseline: number }, b: { weekXp: number; baseline: number }): DuelOutcome {
  const sa = duelScore(a.weekXp, a.baseline);
  const sb = duelScore(b.weekXp, b.baseline);
  if (Math.abs(sa - sb) < 1e-9) return 'draw';
  return sa > sb ? 'challenger' : 'opponent';
}

/** After a week: places 1..N by XP desc; ties share the best place (competition ranking). */
export function leaguePlaces(xpByUser: readonly { userId: string; xp: number }[]): { userId: string; xp: number; place: number }[] {
  const sorted = [...xpByUser].sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId));
  const places: { userId: string; xp: number; place: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const prev = places[i - 1];
    const place = prev && prev.xp === sorted[i]!.xp ? prev.place : i + 1;
    places.push({ userId: sorted[i]!.userId, xp: sorted[i]!.xp, place });
  }
  return places;
}

/** Next tier after promotion/demotion. Mythic stays Mythic on promote; Bronze stays on demote. */
export function nextLeagueTier(tier: LeagueTier, place: number, groupSize = LEAGUE.size): LeagueTier {
  const i = LEAGUE.tiers.indexOf(tier);
  if (place <= LEAGUE.promote && i < LEAGUE.tiers.length - 1) return LEAGUE.tiers[i + 1]!;
  if (place > groupSize - LEAGUE.demote && i > 0) return LEAGUE.tiers[i - 1]!;
  return tier;
}

/** Ordered pair key so FriendStreak / Conversation rows are unique regardless of who acts first. */
export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
