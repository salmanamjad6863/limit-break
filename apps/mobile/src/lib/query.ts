import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { asyncStorage } from './storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, gcTime: 24 * 60 * 60_000, retry: 2 },
    // Offline-first: paused mutations are persisted and replayed (ARCHITECTURE.md §6.2)
    mutations: { networkMode: 'offlineFirst', retry: 3 },
  },
});

export const queryPersister = createAsyncStoragePersister({ storage: asyncStorage, key: 'lb-query-cache' });
