/**
 * The hunter's profile picture. Kept on this phone only (encrypted store), small and square: community
 * avatars stay the framed initial until photo uploads have image moderation.
 */
import * as ImagePicker from 'expo-image-picker';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

interface ProfilePhotoState {
  /** data URI (square JPEG) or null for the initial */
  photo: string | null;
  set: (photo: string | null) => void;
}

export const useProfilePhoto = create<ProfilePhotoState>()(
  persist((set) => ({ photo: null, set: (photo) => set({ photo }) }), {
    name: 'lb-profile-photo', storage: createJSONStorage(() => zustandStorage), partialize: (s) => ({ photo: s.photo }),
  }),
);

/** Pick and crop a square photo; returns false if cancelled. */
export async function pickProfilePhoto(from: 'library' | 'camera'): Promise<boolean> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.35, base64: true };
  const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = res.canceled ? null : res.assets[0];
  if (!a?.base64) return false;
  useProfilePhoto.getState().set(`data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}`);
  return true;
}
