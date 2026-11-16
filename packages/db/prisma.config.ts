import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * The Prisma CLI (migrate, introspect) uses the DIRECT connection.
 * The runtime client uses the pooled DATABASE_URL via the pg adapter (src/index.ts).
 * `prisma generate` needs no database, so a missing DIRECT_URL only fails migrate/introspect.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DIRECT_URL ?? '' },
});
