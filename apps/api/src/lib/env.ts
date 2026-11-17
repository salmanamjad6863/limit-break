import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().default(8787),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  PAYWALL_ENABLED: z.stringbool().default(false),
  /** server-only; enables account deletion of the auth user (never ship to the app) */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  USDA_API_KEY: z.string().min(1).optional(),
  SENTRY_DSN: z.url().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  /** comma-separated user ids who may review A/S trial videos */
  MODERATOR_IDS: z.string().optional(),
});
export type Env = z.infer<typeof Env>;

let cached: Env | undefined;
export const env = (): Env => (cached ??= Env.parse(process.env));
