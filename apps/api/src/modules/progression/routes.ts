import { zValidator } from '@hono/zod-validator';
import { ReviewInput, SubmitVerificationInput, TrialAttemptInput } from '@lb/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { attemptTrial, getProgression, TrialError } from './service';
import { postMilestones } from '../community/milestones';
import * as v from './verification';

const vguard = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof v.VerificationError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
};

export const progressionRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => c.json(await getProgression(c.get('deps').prisma, c.get('userId'))))
  .post('/trials', zValidator('json', TrialAttemptInput), async (c) => {
    try {
      const input = c.req.valid('json');
      const res = await attemptTrial(c.get('deps').prisma, c.get('userId'), input);
      // a retried attempt answers with the stored result; its milestones were posted the first time
      if (!res.duplicate) await postMilestones(c.get('deps').prisma, c.get('userId'), input.id, (res as { rewards?: unknown[] }).rewards ?? []);
      return c.json(res);
    } catch (e) {
      if (e instanceof TrialError) throw new HTTPException(e.code === 'not-eligible' ? 409 : 400, { message: e.message });
      throw e;
    }
  })
  .post('/trials/:id/verification/upload', async (c) => c.json(await vguard(() => v.startUpload(c.get('deps').prisma, c.get('deps'), c.get('userId'), c.req.param('id')))))
  .post('/trials/:id/verification', zValidator('json', SubmitVerificationInput), async (c) =>
    c.json(await vguard(() => v.submit(c.get('deps').prisma, c.get('userId'), c.req.param('id'), c.req.valid('json').videoKey))),
  )
  /** moderator review queue (also used by the web admin later) */
  .get('/reviews', async (c) => c.json({ pending: await vguard(() => v.listPending(c.get('deps').prisma, c.get('deps'), c.get('userId'))) }))
  .post('/reviews/:id', zValidator('json', ReviewInput), async (c) =>
    c.json(await vguard(() => v.review(c.get('deps').prisma, c.get('deps'), c.get('userId'), c.req.param('id'), c.req.valid('json')))),
  );
