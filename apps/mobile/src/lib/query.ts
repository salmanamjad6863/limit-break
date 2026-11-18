import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import type { Persister } from '@tanstack/react-query-persist-client';
import { AppState, Platform } from 'react-native';
import { env } from './env';
import { asyncStorage, storage } from './storage';

/** MMKV key of the persisted Query cache (also removed directly by clearLocalData). */
export const QUERY_CACHE_KEY = 'lb-query-cache';

/** A fetch that never reached the server (offline, DNS, timeout), as opposed to an API error answer. */
export function isNetworkError(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null;
  return err?.name === 'AbortError' || /network request failed|failed to fetch|networkerror|load failed/i.test(err?.message ?? '');
}

// --- Online state -----------------------------------------------------------------------------------------
// No NetInfo / expo-network in this app, and React Native has no window 'online' events, so TanStack would
// think it is always online and never pause (or replay) offline mutations. Instead: the first request that
// can't reach the server marks the app offline (retries then pause and are persisted), and a light probe of
// the API health endpoint (while offline, and whenever the app comes to the foreground) flips it back online,
// which resumes paused mutations and refetches.
const PROBE_MS = 15_000;
let probeTimer: ReturnType<typeof setTimeout> | null = null;

async function reachable(): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5_000);
  try {
    await fetch(`${env.apiUrl}/health`, { method: 'GET', signal: ctrl.signal });
    return true; // any HTTP answer means the network is back
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function probeSoon() {
  if (probeTimer) return;
  probeTimer = setTimeout(async () => {
    probeTimer = null;
    if (await reachable()) onlineManager.setOnline(true);
    else if (!onlineManager.isOnline()) probeSoon();
  }, PROBE_MS);
}

function markOffline() {
  if (Platform.OS === 'web') return;
  onlineManager.setOnline(false);
  probeSoon();
}

if (Platform.OS !== 'web') {
  onlineManager.setEventListener((setOnline) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !onlineManager.isOnline()) void reachable().then((ok) => ok && setOnline(true));
    });
    return () => sub.remove();
  });
}

/** Retry policy that also notices "offline", so the next attempt pauses instead of failing. */
const retryUpTo = (max: number) => (failureCount: number, error: unknown) => {
  if (isNetworkError(error)) markOffline();
  return failureCount < max;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, gcTime: 24 * 60 * 60_000, retry: retryUpTo(2) },
    // Offline-first: paused mutations are persisted and replayed (ARCHITECTURE.md §6.2)
    mutations: { networkMode: 'offlineFirst', retry: retryUpTo(3) },
  },
});

// --- Persisted cache, scoped to one account ---------------------------------------------------------------
/** Whose cache this is (user id, or 'none'); set by the session layer before the cache is restored. */
let owner = 'none';
export function setQueryCacheOwner(userId: string | null) {
  owner = userId ?? 'none';
}

const base = createAsyncStoragePersister({ storage: asyncStorage, key: QUERY_CACHE_KEY });

/**
 * Every save is tagged with the signed-in account; a restore only accepts a cache saved by the same account.
 * A late (throttled) save from the previous account therefore can never be restored for the next one.
 */
export const queryPersister: Persister = {
  persistClient: (client) => base.persistClient({ ...client, buster: `${owner}|${client.buster}` }),
  restoreClient: async () => {
    const client = await base.restoreClient();
    if (!client) return undefined;
    const sep = client.buster.indexOf('|');
    if (sep < 0 || client.buster.slice(0, sep) !== owner) {
      await base.removeClient();
      return undefined;
    }
    return { ...client, buster: client.buster.slice(sep + 1) };
  },
  removeClient: async () => {
    storage.remove(QUERY_CACHE_KEY);
    await base.removeClient();
  },
};
