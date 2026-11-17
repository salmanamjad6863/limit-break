import type { PrismaClient } from '@lb/db';

/** Dependencies injected into the app — lets tests swap Prisma and auth. */
export interface Deps {
  prisma: PrismaClient;
  verifyToken: (token: string) => Promise<{ userId: string }>;
  paywallEnabled: boolean;
  /** CORS allow-list for browsers (web app); empty = any (dev) */
  allowedOrigins?: string[];
  /** crash reporting hook (Sentry in production); never receives request bodies */
  reportError?: (error: unknown, context: Record<string, unknown>) => void;
  /** private object storage (Supabase Storage) — signed URLs only */
  storage?: { signUpload: (bucket: string, path: string) => Promise<string>; signRead: (bucket: string, path: string, seconds: number) => Promise<string> };
  /** user ids allowed to review A/S trial videos */
  moderatorIds?: string[];
  /** removes the Supabase auth user (admin API); absent in tests/dev without a service key */
  deleteAuthUser?: (userId: string) => Promise<void>;
  /** barcode → raw Open Food Facts JSON (injected so tests never hit the network) */
  lookupBarcode?: (barcode: string) => Promise<unknown>;
}

export type AppEnv = {
  Variables: { userId: string; deps: Deps; requestId: string };
};
