import type { AppType } from '@lb/api';
import { hc } from 'hono/client';
import { env } from './env';
import { getAccessToken } from './supabase';

/** End-to-end typed client for apps/api (ARCHITECTURE.md §6.3). */
export const api = hc<AppType>(env.apiUrl, {
  headers: async (): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Throws ApiError on non-2xx so TanStack Query treats it as a failure, and returns the
 * success body typed as T (error-status bodies are excluded by the throw).
 */
export async function unwrap<T>(res: { ok: boolean; status: number; json(): Promise<unknown> }): Promise<T> {
  if (!res.ok) throw new ApiError(res.status, `API ${res.status}`);
  return (await res.json()) as T;
}
