import { zValidator } from '@hono/zod-validator';
import { EditWorkoutInput, ExerciseNoteInput, FinishWorkoutInput, ManualWorkoutInput } from '@lb/contracts';
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
    if (e instanceof s.WorkoutError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
};
const db = (c: Context<AppEnv>) => c.get('deps').prisma;
const me = (c: Context<AppEnv>) => c.get('userId');

export const workoutRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .post('/finish', zValidator('json', FinishWorkoutInput), async (c) => c.json(await s.finishWorkout(db(c), me(c), c.req.valid('json'))))
  .get('/', zValidator('query', z.object({ before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })), async (c) =>
    c.json({ workouts: await s.listWorkouts(db(c), me(c), c.req.valid('query').before) }),
  )
  .post('/manual', zValidator('json', ManualWorkoutInput), async (c) => c.json(await guard(() => s.logManual(db(c), me(c), c.req.valid('json')))))
  .get('/notes', async (c) => c.json(await s.getNotes(db(c), me(c))))
  .put('/notes/:exerciseId', zValidator('json', ExerciseNoteInput), async (c) =>
    c.json(await guard(() => s.setNote(db(c), me(c), c.req.param('exerciseId'), c.req.valid('json').note))),
  )
  .get('/:id', async (c) => c.json(await guard(() => s.getWorkout(db(c), me(c), c.req.param('id')))))
  .patch('/:id', zValidator('json', EditWorkoutInput), async (c) => c.json(await guard(() => s.editWorkout(db(c), me(c), c.req.param('id'), c.req.valid('json')))))
  .delete('/:id', async (c) => c.json(await guard(() => s.deleteWorkout(db(c), me(c), c.req.param('id')))));
