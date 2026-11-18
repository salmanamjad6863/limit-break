import { zValidator } from '@hono/zod-validator';
import { ConsentInput, IdentityInput, NotificationSettingsInput, OnboardingInput, TrainingSettingsInput } from '@lb/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { AccountError, deleteAccount, exportData } from './account';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { completeOnboarding, getMe, ProfileError, recordConsent, updateIdentity, updateNotifications, updateTraining } from './service';

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
  .put('/training', zValidator('json', TrainingSettingsInput), async (c) => {
    try {
      return c.json(await updateTraining(c.get('deps').prisma, c.get('userId'), c.req.valid('json')));
    } catch (e) {
      if (e instanceof ProfileError) throw new HTTPException(e.status, { message: e.message });
      throw e;
    }
  })
  .put('/identity', zValidator('json', IdentityInput), async (c) => {
    try {
      return c.json(await updateIdentity(c.get('deps').prisma, c.get('userId'), c.req.valid('json')));
    } catch (e) {
      if (e instanceof ProfileError) throw new HTTPException(e.status, { message: e.message });
      throw e;
    }
  })
  .put('/notifications', zValidator('json', NotificationSettingsInput), async (c) => {
    try {
      return c.json(await updateNotifications(c.get('deps').prisma, c.get('userId'), c.req.valid('json')));
    } catch (e) {
      if (e instanceof ProfileError) throw new HTTPException(e.status, { message: e.message });
      throw e;
    }
  });
