import { z } from 'zod';

/** Feature matrix keys — SYSTEMS.md §7.1. The tier for each lives in @lb/content/features.json. */
export const FeatureKey = z.enum([
  'dailyQuests', 'logger', 'barcode', 'rankTrials', 'guilds', 'starterPrograms',
  'allPrograms', 'adaptiveTdee', 'aiPhotoLog', 'shadowBossAnalytics', 'premiumSeasonTrack', 'extraShields',
]);
export type FeatureKey = z.infer<typeof FeatureKey>;
export const FeatureTier = z.enum(['free', 'premium']);
export type FeatureTier = z.infer<typeof FeatureTier>;
export const FeatureMatrix = z.record(FeatureKey, FeatureTier);
export type FeatureMatrix = z.infer<typeof FeatureMatrix>;
