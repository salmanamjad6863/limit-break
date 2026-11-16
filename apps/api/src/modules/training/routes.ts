import { exercises } from '@lb/content';
import { Hono } from 'hono';
import type { AppEnv } from '../../lib/types';

/** Public, cacheable content. Workout logging routes arrive in Sprint 3. */
export const trainingRoutes = new Hono<AppEnv>().get('/exercises', (c) => {
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json(exercises);
});
