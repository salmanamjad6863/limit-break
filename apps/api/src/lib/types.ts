import type { PrismaClient } from '@lb/db';

/** Dependencies injected into the app — lets tests swap Prisma and auth. */
export interface Deps {
  prisma: PrismaClient;
  verifyToken: (token: string) => Promise<{ userId: string }>;
  paywallEnabled: boolean;
}

export type AppEnv = {
  Variables: { userId: string; deps: Deps; requestId: string };
};
