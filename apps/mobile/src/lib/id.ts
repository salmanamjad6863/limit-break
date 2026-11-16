import { randomUUID } from 'expo-crypto';

/** Client-generated ids double as idempotency keys for every write. */
export const newId = (): string => randomUUID();
