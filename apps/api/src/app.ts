import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import type { AppEnv, Deps } from './lib/types';
import { featureRoutes } from './modules/features/routes';
import { profileRoutes } from './modules/profile/routes';
import { progressionRoutes } from './modules/progression/routes';
import { trainingRoutes } from './modules/training/routes';
import { workoutRoutes } from './modules/workouts/routes';

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>()
    .use(requestId())
    .use(cors())
    .use(async (c, next) => {
      c.set('deps', deps);
      await next();
    })
    .get('/health', (c) => c.json({ ok: true, service: 'limitbreak-api' }))
    .route('/me', profileRoutes)
    .route('/features', featureRoutes)
    .route('/training', trainingRoutes)
    .route('/workouts', workoutRoutes)
    .route('/progression', progressionRoutes);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(`[${c.get('requestId')}]`, err);
    return c.json({ error: 'internal error', requestId: c.get('requestId') }, 500);
  });
  return app;
}

/** Type-only export for the mobile Hono RPC client (ARCHITECTURE.md §6.3). */
export type AppType = ReturnType<typeof createApp>;
