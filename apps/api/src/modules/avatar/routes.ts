import { zValidator } from '@hono/zod-validator';
import { BuyCosmeticInput, EquipCosmeticInput } from '@lb/contracts';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { userRateLimit } from '../../middleware/rateLimit';
import * as s from './service';

const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof s.AvatarError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
};
const db = (c: Context<AppEnv>) => c.get('deps').prisma;
const me = (c: Context<AppEnv>) => c.get('userId');

const writeLimit = userRateLimit('avatar-write', { limit: 60, windowMs: 60_000 });

export const avatarRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => c.json(await guard(() => s.getAvatarMe(db(c), me(c)))))
  .put('/equip', writeLimit, zValidator('json', EquipCosmeticInput), async (c) =>
    c.json(await guard(() => s.equipCosmetic(db(c), me(c), c.req.valid('json')))),
  )
  .post('/buy', writeLimit, zValidator('json', BuyCosmeticInput), async (c) => {
    const profile = await db(c).profile.findUnique({ where: { id: me(c) }, select: { timezone: true } });
    return c.json(await guard(() => s.buyCosmetic(db(c), me(c), c.req.valid('json'), profile?.timezone ?? 'UTC')));
  });
