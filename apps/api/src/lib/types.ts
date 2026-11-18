import type { PrismaClient } from '@lb/db';
import type { Classifier } from '../modules/community/moderation';
import type { DebriefWriter } from '../modules/depth/debrief';

/** Dependencies injected into the app — lets tests swap Prisma and auth. */
export interface Deps {
  prisma: PrismaClient;
  /** isGuest = anonymous (guest-first) account; community features will require a saved account */
  verifyToken: (token: string) => Promise<{ userId: string; isGuest?: boolean }>;
  paywallEnabled: boolean;
  /** CORS allow-list for browsers (web app); empty = any (dev) */
  allowedOrigins?: string[];
  /** crash reporting hook (Sentry in production); never receives request bodies */
  reportError?: (error: unknown, context: Record<string, unknown>) => void;
  /** private object storage (Supabase Storage) — signed URLs only */
  storage?: { signUpload: (bucket: string, path: string) => Promise<string>; signRead: (bucket: string, path: string, seconds: number) => Promise<string>; remove?: (bucket: string, path: string) => Promise<void> };
  /** user ids allowed to review A/S trial videos */
  moderatorIds?: string[];
  /** removes the Supabase auth user (admin API); absent in tests/dev without a service key */
  deleteAuthUser?: (userId: string) => Promise<void>;
  /** community pre-moderation classifier (Claude Haiku 5.5); absent = wordlist only, new accounts held for review */
  classifier?: Classifier;
  /** extra blocked words for the community (COMMUNITY_WORDLIST), matched on whole words */
  communityWordlist?: string[];
  /** weekly debrief writer (Claude Haiku 5.5, System voice); absent = deterministic template */
  debriefWriter?: DebriefWriter;
  /** barcode → raw Open Food Facts JSON (injected so tests never hit the network) */
  lookupBarcode?: (barcode: string) => Promise<unknown>;
}

export type AppEnv = {
  Variables: { userId: string; isGuest: boolean; deps: Deps; requestId: string };
};
