import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';

/** One client per process. Uses the pooled DATABASE_URL (Supavisor transaction mode). */
export function createPrisma(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
