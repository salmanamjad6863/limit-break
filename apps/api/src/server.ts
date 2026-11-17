import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';
import { createPrisma } from '@lb/db';
import { createApp } from './app';
import { supabaseAdminDeleter, supabaseStorage, supabaseVerifier } from './lib/auth';
import { env } from './lib/env';

const e = env();
if (e.SENTRY_DSN) {
  Sentry.init({
    dsn: e.SENTRY_DSN, tracesSampleRate: 0.1,
    // never ship request bodies (health data) or auth headers
    beforeSend: (event) => {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) delete event.request.headers.authorization;
      }
      return event;
    },
  });
}
const app = createApp({
  prisma: createPrisma(e.DATABASE_URL),
  verifyToken: supabaseVerifier(e.SUPABASE_URL),
  paywallEnabled: e.PAYWALL_ENABLED,
  allowedOrigins: e.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean),
  reportError: e.SENTRY_DSN ? (err, context) => Sentry.captureException(err, { extra: context }) : undefined,
  storage: e.SUPABASE_SERVICE_ROLE_KEY ? supabaseStorage(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY) : undefined,
  moderatorIds: e.MODERATOR_IDS?.split(',').map((x) => x.trim()).filter(Boolean),
  deleteAuthUser: e.SUPABASE_SERVICE_ROLE_KEY ? supabaseAdminDeleter(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY) : undefined,
});

serve({ fetch: app.fetch, port: e.PORT }, (info) => {
  console.log(`LIMITBREAK API listening on http://localhost:${info.port}`);
});
