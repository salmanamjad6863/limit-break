import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import type { AppEnv, Deps } from './lib/types';
import { rateLimit } from './middleware/rateLimit';
import { communityRoutes } from './modules/community/routes';
import { featureRoutes } from './modules/features/routes';
import { nutritionRoutes } from './modules/nutrition/routes';
import { profileRoutes } from './modules/profile/routes';
import { progressionRoutes } from './modules/progression/routes';
import { questRoutes } from './modules/quests/routes';
import { trainingRoutes } from './modules/training/routes';
import { workoutRoutes } from './modules/workouts/routes';

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>()
    .use(requestId())
    .use(secureHeaders())
    // production: set ALLOWED_ORIGINS (comma-separated) for the web app; native apps send no Origin
    .use(cors({ origin: deps.allowedOrigins?.length ? deps.allowedOrigins : '*' }))
    .use(bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: 'request too large' }, 413) }))
    // generous general limit; tighter ones on costly or sensitive routes
    .use('*', rateLimit('all', { limit: 240, windowMs: 60_000 }))
    .use('/nutrition/foods/barcode/*', rateLimit('barcode', { limit: 30, windowMs: 60_000 }))
    .use('/nutrition/foods', rateLimit('search', { limit: 90, windowMs: 60_000 }))
    .use('/progression/trials', rateLimit('trials', { limit: 10, windowMs: 60_000 }))
    .on('DELETE', '/me', rateLimit('account-delete', { limit: 5, windowMs: 3_600_000 }))
    .get('/me/export', rateLimit('export', { limit: 5, windowMs: 3_600_000 }))
    .use(async (c, next) => {
      c.set('deps', deps);
      await next();
    })
    .get('/health', (c) => c.json({ ok: true, service: 'limitbreak-api' }))
    .route('/me', profileRoutes)
    .route('/features', featureRoutes)
    .route('/training', trainingRoutes)
    .route('/workouts', workoutRoutes)
    .route('/progression', progressionRoutes)
    .route('/quests', questRoutes)
    .route('/nutrition', nutritionRoutes)
    .route('/community', communityRoutes);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(`[${c.get('requestId')}]`, err);
    deps.reportError?.(err, { requestId: c.get('requestId'), route: c.req.routePath, method: c.req.method });
    return c.json({ error: 'internal error', requestId: c.get('requestId') }, 500);
  });
  return app;
}

/** Type-only export for the mobile Hono RPC client (ARCHITECTURE.md §6.3). */
export type AppType = ReturnType<typeof createApp>;
