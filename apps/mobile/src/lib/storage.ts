import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

const ID = 'limitbreak';
const KEY_NAME = 'lb.storage.key.v1';
/** Only lives in the Keychain/Keystore, never in a backup, readable after the first unlock (token refresh in background). */
const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

/** The part of MMKV the app uses, so an in-memory fallback can stand in for it. */
export interface KeyValueStore {
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  set(key: string, value: string | number | boolean): void;
  remove(key: string): boolean;
  contains(key: string): boolean;
  clearAll(): void;
}

/** 32 random ASCII characters = an AES-256 key (MMKV takes the key as a string of exactly 32 bytes). */
const newKey = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return Array.from(Crypto.getRandomBytes(32), (b) => alphabet[b & 63]).join('');
};

/** Nothing touches the disk: used only when the keychain can't be used, so health data is never written in plain text. */
function memoryStore(): KeyValueStore {
  const m = new Map<string, string | number | boolean>();
  return {
    getString: (k) => {
      const v = m.get(k);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber: (k) => {
      const v = m.get(k);
      return typeof v === 'number' ? v : undefined;
    },
    getBoolean: (k) => {
      const v = m.get(k);
      return typeof v === 'boolean' ? v : undefined;
    },
    set: (k, v) => {
      m.set(k, v);
    },
    remove: (k) => m.delete(k),
    contains: (k) => m.has(k),
    clearAll: () => m.clear(),
  };
}

/**
 * Everything persisted on the device (auth session, Zustand stores, the Query cache) sits in one MMKV
 * instance encrypted with AES-256. The key is generated on first launch and kept only in the iOS Keychain /
 * Android Keystore. An older plain-text install is encrypted in place, so nobody is signed out by the upgrade.
 * Web has no keychain: there the instance stays plain (the web build is for development only).
 */
function openStorage(): KeyValueStore {
  if (Platform.OS === 'web') return createMMKV({ id: ID });
  // A tiny plain instance that only remembers *whether* the main one was encrypted (no data in it).
  const meta = createMMKV({ id: `${ID}.meta` });
  try {
    let key = SecureStore.getItem(KEY_NAME, KEYCHAIN);
    // A spurious miss must never replace a key that exists: that would make the encrypted data unreadable.
    if (!key && meta.getBoolean('encrypted')) key = SecureStore.getItem(KEY_NAME, KEYCHAIN);
    if (key) return createMMKV({ id: ID, encryptionKey: key, encryptionType: 'AES-256' });

    const fresh = newKey();
    SecureStore.setItem(KEY_NAME, fresh, KEYCHAIN);
    if (meta.getBoolean('encrypted')) {
      // The key is gone (device restore, keychain reset): the old data can't be read. Start clean and signed out.
      const store = createMMKV({ id: ID, encryptionKey: fresh, encryptionType: 'AES-256' });
      store.clearAll();
      return store;
    }
    const store = createMMKV({ id: ID });
    store.encrypt(fresh, 'AES-256');
    meta.set('encrypted', true);
    return store;
  } catch {
    // Keychain unavailable (rare: some emulators, a locked device). Never write health data unencrypted:
    // keep this launch in memory only. The encrypted data is untouched and comes back once the keychain works.
    return memoryStore();
  }
}

/** One fast key-value store for Zustand persistence, the Query cache and the auth session. */
export const storage: KeyValueStore = openStorage();

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
