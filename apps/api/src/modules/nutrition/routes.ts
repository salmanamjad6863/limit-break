import { zValidator } from '@hono/zod-validator';
import { CopyInput, DayFlagsInput, FoodDto, FoodLogInput, FoodLogPatch, NutritionSettings, WeighInInput } from '@lb/contracts';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import * as s from './service';

const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof s.NutritionError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
};
const db = (c: Context<AppEnv>) => c.get('deps').prisma;
const me = (c: Context<AppEnv>) => c.get('userId');

export const nutritionRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/day', zValidator('query', z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })), async (c) =>
    c.json(await guard(() => s.getDay(db(c), me(c), c.req.valid('query').date))),
  )
  .get('/summary', async (c) => c.json(await guard(() => s.getSummary(db(c), me(c)))))
  .put('/settings', zValidator('json', NutritionSettings), async (c) => c.json(await guard(() => s.updateSettings(db(c), me(c), c.req.valid('json')))))
  .post('/logs', zValidator('json', FoodLogInput), async (c) => c.json(await guard(() => s.addLog(db(c), me(c), c.req.valid('json')))))
  .patch('/logs/:id', zValidator('json', FoodLogPatch), async (c) => c.json(await guard(() => s.patchLog(db(c), me(c), c.req.param('id'), c.req.valid('json')))))
  .delete('/logs/:id', async (c) => c.json(await guard(() => s.deleteLog(db(c), me(c), c.req.param('id')))))
  .post('/copy', zValidator('json', CopyInput), async (c) => c.json(await guard(() => s.copyLogs(db(c), me(c), c.req.valid('json')))))
  .post('/day', zValidator('json', DayFlagsInput), async (c) => c.json(await guard(() => s.setDayFlags(db(c), me(c), c.req.valid('json')))))
  .get('/foods', zValidator('query', z.object({ q: z.string().max(80).default('') })), async (c) =>
    c.json({ foods: await guard(() => s.searchFoods(db(c), me(c), c.req.valid('query').q)) }),
  )
  .get('/foods/barcode/:code', async (c) => c.json(await guard(() => s.lookupBarcode(db(c), c.req.param('code'), c.get('deps').lookupBarcode))))
  .post('/foods', zValidator('json', FoodDto), async (c) => c.json(await guard(() => s.createFood(db(c), me(c), c.req.valid('json')))))
  .post('/weigh-ins', zValidator('json', WeighInInput), async (c) => c.json(await guard(() => s.addWeighIn(db(c), me(c), c.req.valid('json')))))
  .delete('/weigh-ins/:id', async (c) => c.json(await guard(() => s.deleteWeighIn(db(c), me(c), c.req.param('id')))));
