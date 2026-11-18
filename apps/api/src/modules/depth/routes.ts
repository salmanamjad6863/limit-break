import { zValidator } from '@hono/zod-validator';
import {
  ApplyMealTemplateInput, CreateProgressPhotoInput, GenerateDebriefInput, MeasurementInput, ProgressPhotoKind, SignProgressPhotoInput, UpsertMealTemplateInput,
} from '@lb/contracts';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { userRateLimit } from '../../middleware/rateLimit';
import * as s from './service';

const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof s.DepthError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
};
const db = (c: Context<AppEnv>) => c.get('deps').prisma;
const deps = (c: Context<AppEnv>) => c.get('deps');
const me = (c: Context<AppEnv>) => c.get('userId');
const id = z.object({ id: z.uuid() });

/** Debrief generation can call a model: keep it cheap per user. */
const debriefLimit = userRateLimit('depth-debrief', { limit: 20, windowMs: 3_600_000 });

export const depthRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  // measurements
  .get('/measurements', async (c) => c.json(await guard(() => s.listMeasurements(db(c), me(c)))))
  .post('/measurements', zValidator('json', MeasurementInput), async (c) => c.json(await guard(() => s.upsertMeasurement(db(c), me(c), c.req.valid('json')))))
  // progress photos (private bucket, never in community payloads)
  .post('/photos/sign', zValidator('json', SignProgressPhotoInput), async (c) => c.json(await guard(() => s.signPhoto(deps(c), me(c), c.req.valid('json').id))))
  .post('/photos', zValidator('json', CreateProgressPhotoInput), async (c) => c.json(await guard(() => s.createPhoto(db(c), deps(c), me(c), c.req.valid('json')))))
  .get('/photos/awakening', async (c) => c.json(await guard(() => s.awakeningPair(db(c), deps(c), me(c)))))
  .get('/photos', zValidator('query', z.object({ kind: ProgressPhotoKind.optional() })), async (c) =>
    c.json(await guard(() => s.listPhotos(db(c), deps(c), me(c), c.req.valid('query').kind))),
  )
  .delete('/photos/:id', zValidator('param', id), async (c) => c.json(await guard(() => s.deletePhoto(db(c), deps(c), me(c), c.req.valid('param').id))))
  // meal templates
  .get('/meal-templates', async (c) => c.json(await guard(() => s.listTemplates(db(c), me(c)))))
  .put('/meal-templates', zValidator('json', UpsertMealTemplateInput), async (c) => c.json(await guard(() => s.upsertTemplate(db(c), me(c), c.req.valid('json')))))
  .delete('/meal-templates/:id', zValidator('param', id), async (c) => c.json(await guard(() => s.deleteTemplate(db(c), me(c), c.req.valid('param').id))))
  .post('/meal-templates/:id/apply', zValidator('param', id), zValidator('json', ApplyMealTemplateInput), async (c) =>
    c.json(await guard(() => s.applyTemplate(db(c), me(c), c.req.valid('param').id, c.req.valid('json')))),
  )
  // weekly debrief
  .get('/debrief', debriefLimit, zValidator('query', z.object({ week: z.iso.date().optional() })), async (c) =>
    c.json(await guard(() => s.getDebrief(db(c), deps(c), me(c), c.req.valid('query').week))),
  )
  .post('/debrief/generate', debriefLimit, zValidator('json', GenerateDebriefInput), async (c) =>
    c.json(await guard(() => s.generateDebrief(db(c), deps(c), me(c), c.req.valid('json').weekStart))),
  );
