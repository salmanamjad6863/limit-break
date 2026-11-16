import { features } from '@lb/content';
import { FeatureKey, type FeatureTier } from '@lb/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { hasFeature } from '../../middleware/features';

/** The app mirrors this into useFeature() so client and server always agree. */
export const featureRoutes = new Hono<AppEnv>().use(requireAuth).get('/', async (c) => {
  const deps = c.get('deps');
  const userId = c.get('userId');
  const entries = await Promise.all(
    FeatureKey.options.map(async (k) => [k, { tier: features[k], enabled: await hasFeature(deps, userId, k) }] as const),
  );
  const map = Object.fromEntries(entries) as Record<FeatureKey, { tier: FeatureTier; enabled: boolean }>;
  return c.json({ paywallEnabled: deps.paywallEnabled, features: map });
});
