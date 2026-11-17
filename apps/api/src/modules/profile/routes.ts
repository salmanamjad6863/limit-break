import { zValidator } from '@hono/zod-validator';
import { OnboardingInput, TrainingSettingsInput } from '@lb/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { completeOnboarding, getMe, updateTraining } from './service';

export const profileRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => c.json(await getMe(c.get('deps').prisma, c.get('userId'))))
  .post('/onboarding', zValidator('json', OnboardingInput), async (c) =>
    c.json(await completeOnboarding(c.get('deps').prisma, c.get('userId'), c.req.valid('json'))),
  )
  .put('/training', zValidator('json', TrainingSettingsInput), async (c) =>
    c.json(await updateTraining(c.get('deps').prisma, c.get('userId'), c.req.valid('json'))),
  );
