import { createMMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

/** One fast key-value store for Zustand persistence, the Query cache and the auth session. */
export const storage = createMMKV({ id: 'limitbreak' });

export const zustandStorage: StateStorage = {
  getItem: (key) => storage.getString(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => {
    storage.remove(key);
  },
};

/** Async-shaped adapter (Supabase auth + TanStack persister expect promises). */
export const asyncStorage = {
  getItem: async (key: string) => storage.getString(key) ?? null,
  setItem: async (key: string, value: string) => storage.set(key, value),
  removeItem: async (key: string) => {
    storage.remove(key);
  },
};
