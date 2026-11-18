import { zValidator } from '@hono/zod-validator';
import { ConsentInput, OnboardingInput, TrainingSettingsInput } from '@lb/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { AccountError, deleteAccount, exportData } from './account';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { completeOnboarding, getMe, recordConsent, updateTraining } from './service';

export const profileRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => c.json(await getMe(c.get('deps').prisma, c.get('userId'))))
  .post('/onboarding', zValidator('json', OnboardingInput), async (c) =>
    c.json(await completeOnboarding(c.get('deps').prisma, c.get('userId'), c.req.valid('json'))),
  )
  .get('/export', async (c) => {
    c.header('Content-Disposition', 'attachment; filename="limitbreak-export.json"');
    return c.json(await exportData(c.get('deps').prisma, c.get('userId')));
  })
  /** permanent; the client must send the typed confirmation */
  .delete('/', zValidator('json', z.object({ confirm: z.literal('DELETE') })), async (c) => {
    try {
      return c.json(await deleteAccount(c.get('deps').prisma, c.get('userId'), c.get('deps').deleteAuthUser));
    } catch (e) {
      if (e instanceof AccountError) throw new HTTPException(e.status, { message: e.message });
      throw e;
    }
  })
  .post('/consent', zValidator('json', ConsentInput), async (c) =>
    c.json(await recordConsent(c.get('deps').prisma, c.get('userId'), c.req.valid('json').version)),
  )
  .put('/training', zValidator('json', TrainingSettingsInput), async (c) =>
    c.json(await updateTraining(c.get('deps').prisma, c.get('userId'), c.req.valid('json'))),
  );
