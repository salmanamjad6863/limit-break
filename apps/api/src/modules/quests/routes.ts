import { zValidator } from '@hono/zod-validator';
import { ChooseSidesInput, QuestProgressInput, SickInput } from '@lb/contracts';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { chooseSides, claimBoss, getBoss, getToday, QuestError, setSick, updateQuest } from './service';

const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof QuestError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
};
const ctx = (c: Context<AppEnv>) => ({ prisma: c.get('deps').prisma, userId: c.get('userId') });

export const questRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/today', async (c) => c.json(await guard(() => getToday(ctx(c).prisma, ctx(c).userId))))
  .post('/:id/progress', zValidator('json', QuestProgressInput), async (c) =>
    c.json(await guard(() => updateQuest(ctx(c).prisma, ctx(c).userId, c.req.param('id'), c.req.valid('json').progress))),
  )
  .post('/sides', zValidator('json', ChooseSidesInput), async (c) => c.json(await guard(() => chooseSides(ctx(c).prisma, ctx(c).userId, c.req.valid('json').ids))))
  .post('/sick', zValidator('json', SickInput), async (c) => c.json(await guard(() => setSick(ctx(c).prisma, ctx(c).userId, c.req.valid('json').on))))
  .get('/boss', async (c) => c.json(await guard(() => getBoss(ctx(c).prisma, ctx(c).userId))))
  .post('/boss/claim', async (c) => c.json(await guard(() => claimBoss(ctx(c).prisma, ctx(c).userId))));
