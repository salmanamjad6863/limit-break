import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().default(8787),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  PAYWALL_ENABLED: z.stringbool().default(false),
});
export type Env = z.infer<typeof Env>;

let cached: Env | undefined;
export const env = (): Env => (cached ??= Env.parse(process.env));
