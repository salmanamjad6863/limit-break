import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createMMKV, type MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

const ID = 'limitbreak';
const KEY_NAME = 'lb.storage.key.v1';
/** Only lives in the Keychain/Keystore, never in a backup, readable after the first unlock (token refresh in background). */
const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

/** 32 random ASCII characters = an AES-256 key (MMKV takes the key as a string of exactly 32 bytes). */
const newKey = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return Array.from(Crypto.getRandomBytes(32), (b) => alphabet[b & 63]).join('');
};

/**
 * Everything persisted on the device (auth session, Zustand stores, the Query cache) sits in one MMKV
 * instance encrypted with AES-256. The key is generated on first launch and kept only in the iOS Keychain /
 * Android Keystore. An older plain-text install is encrypted in place, so nobody is signed out by the upgrade.
 * Web has no keychain: there the instance stays plain (the web build is for development only).
 */
function openStorage(): MMKV {
  if (Platform.OS === 'web') return createMMKV({ id: ID });
  // A tiny plain instance that only remembers *whether* the main one was encrypted (no data in it).
  const meta = createMMKV({ id: `${ID}.meta` });
  try {
    const key = SecureStore.getItem(KEY_NAME, KEYCHAIN);
    if (key) return createMMKV({ id: ID, encryptionKey: key, encryptionType: 'AES-256' });

    const fresh = newKey();
    SecureStore.setItem(KEY_NAME, fresh, KEYCHAIN);
    let store: MMKV;
    if (meta.getBoolean('encrypted')) {
      // The key is gone (device restore, keychain reset): the old data can't be read. Start clean and signed out.
      store = createMMKV({ id: ID, encryptionKey: fresh, encryptionType: 'AES-256' });
      store.clearAll();
    } else {
      store = createMMKV({ id: ID });
      store.encrypt(fresh, 'AES-256');
    }
    meta.set('encrypted', true);
    return store;
  } catch {
    // Keychain unavailable (rare: some emulators). Never lock the user out; plain storage until it works again.
    return meta.getBoolean('encrypted') ? createMMKV({ id: `${ID}.fallback` }) : createMMKV({ id: ID });
  }
}

/** One fast key-value store for Zustand persistence, the Query cache and the auth session. */
export const storage = openStorage();

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
