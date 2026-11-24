import { z } from 'zod';

export const AchievementProgressDto = z.object({
  id: z.string(),
  value: z.number(),
  /** highest tier earned, -1 none */
  earned: z.number().int(),
  next: z.number().nullable(),
  ratio: z.number(),
  /** tier index → ISO time it was earned */
  unlockedAt: z.record(z.string(), z.string()),
});
export type AchievementProgressDto = z.infer<typeof AchievementProgressDto>;

export const EarnedTitleDto = z.object({ title: z.string(), achievementId: z.string(), tier: z.number().int() });
export type EarnedTitleDto = z.infer<typeof EarnedTitleDto>;

/** POST /achievements/check: evaluates, pays any new tiers once, and returns everything the trophy case shows. */
export const AchievementsResponse = z.object({
  progress: z.array(AchievementProgressDto),
  titles: z.array(EarnedTitleDto),
  equippedTitle: z.string().nullable(),
  /** new tiers in this check (achievement + XP rewards) */
  rewards: z.array(z.unknown()),
});
export type AchievementsResponse = z.infer<typeof AchievementsResponse>;

export const EquipTitleInput = z.object({ title: z.string().max(60).nullable() });
export type EquipTitleInput = z.infer<typeof EquipTitleInput>;
