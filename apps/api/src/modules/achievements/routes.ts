import { zValidator } from '@hono/zod-validator';
import { EquipTitleInput } from '@lb/contracts';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { AchievementError, checkAchievements, equipTitle } from './service';

const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AchievementError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
};
const db = (c: Context<AppEnv>) => c.get('deps').prisma;
const me = (c: Context<AppEnv>) => c.get('userId');

/** Trophy case: POST evaluates and pays new tiers once (safe to call after any activity). */
export const achievementRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .post('/check', async (c) => c.json(await guard(() => checkAchievements(db(c), me(c)))))
  .put('/title', zValidator('json', EquipTitleInput), async (c) => c.json(await guard(() => equipTitle(db(c), me(c), c.req.valid('json').title))));
