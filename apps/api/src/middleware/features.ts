import { features } from '@lb/content';
import type { FeatureKey } from '@lb/contracts';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, Deps } from '../lib/types';

/** SYSTEMS.md §7.1 — the only way the API checks premium access. */
export async function hasFeature(deps: Deps, userId: string, key: FeatureKey): Promise<boolean> {
  if (!deps.paywallEnabled || features[key] === 'free') return true;
  const now = new Date();
  const ent = await deps.prisma.entitlement.findFirst({
    where: { userId, key: 'premium', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true },
  });
  return ent != null;
}

export const requireFeature = (key: FeatureKey) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!(await hasFeature(c.get('deps'), c.get('userId'), key))) {
      throw new HTTPException(402, { message: `feature "${key}" requires premium` });
    }
    await next();
  });
