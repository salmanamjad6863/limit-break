import { zValidator } from '@hono/zod-validator';
import { TrialAttemptInput } from '@lb/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { attemptTrial, getProgression, TrialError } from './service';

export const progressionRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => c.json(await getProgression(c.get('deps').prisma, c.get('userId'))))
  .post('/trials', zValidator('json', TrialAttemptInput), async (c) => {
    try {
      return c.json(await attemptTrial(c.get('deps').prisma, c.get('userId'), c.req.valid('json')));
    } catch (e) {
      if (e instanceof TrialError) throw new HTTPException(e.code === 'not-eligible' ? 409 : 400, { message: e.message });
      throw e;
    }
  });
