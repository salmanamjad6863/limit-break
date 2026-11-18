import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../lib/types';

/**
 * Prisma bypasses RLS, so EVERY authenticated route goes through this and every
 * service filters by ctx userId (ARCHITECTURE.md §2.2).
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) throw new HTTPException(401, { message: 'missing bearer token' });
  try {
    const { userId, isGuest } = await c.get('deps').verifyToken(token);
    c.set('userId', userId);
    c.set('isGuest', isGuest ?? false);
  } catch {
    throw new HTTPException(401, { message: 'invalid token' });
  }
  await next();
});

/** For routes a guest can't use yet (community, public posts): 403 until they save their account. */
export const requireSavedAccount = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('isGuest')) throw new HTTPException(403, { message: 'save your account to use this feature' });
  await next();
});
