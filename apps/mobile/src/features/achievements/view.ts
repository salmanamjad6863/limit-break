/** Display helpers shared by the trophy case, profile showcase, Home nudge and celebrations. */
import { achievementById, type AchievementDef } from '@lb/content';
import type { AchievementProgressDto } from '@lb/contracts';
import { describeTier, tierName } from '@lb/engine';
import type { IconName } from '@/ui';
import type { BadgeTier } from '@/ui/fx';

export const CATEGORY_LABEL: Record<AchievementDef['category'], string> = {
  training: 'Training', consistency: 'Consistency', progression: 'Progression', nutrition: 'Nutrition', hidden: 'Hidden',
};
/** Scene colours behind each category's tiles (dark, rich, so the metal medals pop). */
export const CATEGORY_SCENE: Record<AchievementDef['category'], readonly [string, string]> = {
  training: ['#7C2D12', '#18100C'],
  consistency: ['#1E3A8A', '#0A0E1C'],
  progression: ['#5B21B6', '#110A1F'],
  nutrition: ['#065F46', '#07140F'],
  hidden: ['#26242F', '#0E0D13'],
};
export const TIER_LABEL: Record<BadgeTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };

export const badgeTier = (def: AchievementDef, earned: number): BadgeTier | null => (earned >= 0 ? tierName(def, earned) : null);
export const badgeIcon = (def: AchievementDef) => `${def.icon}` as IconName;

/** What to show for one achievement in a grid cell or list row. */
export function badgeView(p: AchievementProgressDto) {
  const def = achievementById.get(p.id)!;
  const secret = !!def.hidden && p.earned < 0;
  const tier = badgeTier(def, p.earned);
  const nextIndex = p.earned + 1 < def.tiers.length ? p.earned + 1 : null;
  return {
    def, tier, secret,
    name: secret ? '???' : def.name,
    /** the goal being worked on, or the top tier's when complete */
    goal: secret ? 'A hidden achievement. Keep training to find it.' : describeTier(def, nextIndex ?? def.tiers.length - 1),
    nextIndex,
    complete: nextIndex == null,
    progressText: nextIndex == null ? 'Complete' : secret ? '' : `${Math.min(p.value, p.next ?? p.value).toLocaleString('en-US')} / ${(p.next ?? 0).toLocaleString('en-US')}`,
  };
}

/** Earned tiers in total and possible, for "23 / 66" summaries. */
export function tierCounts(progress: readonly AchievementProgressDto[]) {
  let earned = 0;
  let total = 0;
  for (const p of progress) {
    const def = achievementById.get(p.id);
    if (!def) continue;
    total += def.tiers.length;
    earned += p.earned + 1;
  }
  return { earned, total };
}

/** Most recently earned tiers, newest first. */
export function recentUnlocks(progress: readonly AchievementProgressDto[], limit = 5) {
  return progress
    .flatMap((p) => Object.entries(p.unlockedAt).map(([tier, at]) => ({ id: p.id, tier: Number(tier), at })))
    .sort((a, b) => b.at.localeCompare(a.at) || b.tier - a.tier)
    .slice(0, limit);
}
