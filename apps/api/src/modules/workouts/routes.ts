import { zValidator } from '@hono/zod-validator';
import { FinishWorkoutInput } from '@lb/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { finishWorkout } from './service';

export const workoutRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .post('/finish', zValidator('json', FinishWorkoutInput), async (c) =>
    c.json(await finishWorkout(c.get('deps').prisma, c.get('userId'), c.req.valid('json'))),
  );
