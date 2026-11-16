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
    const { userId } = await c.get('deps').verifyToken(token);
    c.set('userId', userId);
  } catch {
    throw new HTTPException(401, { message: 'invalid token' });
  }
  await next();
});
