import { zValidator } from '@hono/zod-validator';
import { ChallengeCheckinInput, CreateChallengeInput } from '@lb/contracts';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { ChallengeError, checkin, createChallenge, endChallenge, listChallenges } from './service';

const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ChallengeError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
};
const db = (c: Context<AppEnv>) => c.get('deps').prisma;
const me = (c: Context<AppEnv>) => c.get('userId');
const idParam = zValidator('param', z.object({ id: z.uuid() }));

/** Own habit challenges (solo, always flexible). */
export const challengeRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => c.json({ challenges: await listChallenges(db(c), me(c)) }))
  .post('/', zValidator('json', CreateChallengeInput), async (c) => c.json(await guard(() => createChallenge(db(c), me(c), c.req.valid('json')))))
  .put('/:id/checkin', idParam, zValidator('json', ChallengeCheckinInput), async (c) =>
    c.json(await guard(() => checkin(db(c), me(c), c.req.valid('param').id, c.req.valid('json')))),
  )
  .post('/:id/end', idParam, async (c) => c.json(await guard(() => endChallenge(db(c), me(c), c.req.valid('param').id))));
