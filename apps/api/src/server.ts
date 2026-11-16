import { serve } from '@hono/node-server';
import { createPrisma } from '@lb/db';
import { createApp } from './app';
import { supabaseVerifier } from './lib/auth';
import { env } from './lib/env';

const e = env();
const app = createApp({
  prisma: createPrisma(e.DATABASE_URL),
  verifyToken: supabaseVerifier(e.SUPABASE_URL),
  paywallEnabled: e.PAYWALL_ENABLED,
});

serve({ fetch: app.fetch, port: e.PORT }, (info) => {
  console.log(`LIMITBREAK API listening on http://localhost:${info.port}`);
});
