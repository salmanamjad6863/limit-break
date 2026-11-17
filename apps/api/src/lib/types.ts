import type { PrismaClient } from '@lb/db';

/** Dependencies injected into the app — lets tests swap Prisma and auth. */
export interface Deps {
  prisma: PrismaClient;
  verifyToken: (token: string) => Promise<{ userId: string }>;
  paywallEnabled: boolean;
  /** barcode → raw Open Food Facts JSON (injected so tests never hit the network) */
  lookupBarcode?: (barcode: string) => Promise<unknown>;
}

export type AppEnv = {
  Variables: { userId: string; deps: Deps; requestId: string };
};
