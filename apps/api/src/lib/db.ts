/** Prisma unique-constraint violation (two concurrent requests racing on the same idempotency key). */
export const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';
