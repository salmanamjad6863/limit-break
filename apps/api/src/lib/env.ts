import { z } from 'zod';

/** `KEY=` in a .env file means "not set": treat blank strings as undefined before validating. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional());

const Env = z.object({
  PORT: z.coerce.number().default(8787),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  PAYWALL_ENABLED: z.preprocess((v) => (v === '' ? undefined : v), z.stringbool().default(false)),
  /** server-only; enables account deletion of the auth user (never ship to the app) */
  SUPABASE_SERVICE_ROLE_KEY: optional(z.string().min(1)),
  USDA_API_KEY: optional(z.string().min(1)),
  SENTRY_DSN: optional(z.url()),
  ALLOWED_ORIGINS: optional(z.string()),
  /** comma-separated user ids who may review A/S trial videos */
  MODERATOR_IDS: optional(z.string()),
  /** community pre-moderation classifier (Claude Haiku 5.5). Unset = wordlist only */
  ANTHROPIC_API_KEY: optional(z.string().min(1)),
  /** extra blocked words/phrases for the community, comma-separated */
  COMMUNITY_WORDLIST: optional(z.string()),
});
export type Env = z.infer<typeof Env>;

let cached: Env | undefined;
export const env = (): Env => (cached ??= Env.parse(process.env));
