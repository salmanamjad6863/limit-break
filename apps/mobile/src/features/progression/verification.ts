/**
 * A/S Rank Trial verification from the phone (SYSTEMS.md §4.4): pick or record a short video,
 * upload it straight to private storage with a one-time signed URL, then submit for review.
 */
import type { VerificationUploadResponse } from '@lb/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/session';
import { api, ApiError, unwrap } from '@/lib/api';
import { progressionKeys } from './keys';

type Picker = {
  launchImageLibraryAsync: (o: Record<string, unknown>) => Promise<{ canceled: boolean; assets?: { uri: string; fileSize?: number; duration?: number | null; mimeType?: string }[] }>;
  requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean }>;
};
/** Lazy: a build made before expo-image-picker was added explains instead of crashing. */
function loadPicker(): Picker | null {
  try {
    return require('expo-image-picker') as Picker; // eslint-disable-line @typescript-eslint/no-require-imports
  } catch {
    return null;
  }
}

export function useVerifyTrial() {
  const status = useSession((s) => s.status);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attemptId: string): Promise<'pending' | 'canceled'> => {
      if (status !== 'signedIn') throw new ApiError(401, 'Verification needs an account, because a moderator reviews the video.');
      const picker = loadPicker();
      if (!picker) throw new ApiError(501, 'Update the app to upload a trial video.');
      if (!(await picker.requestMediaLibraryPermissionsAsync()).granted) throw new ApiError(403, 'Allow photo library access to pick your trial video.');
      const pick = await picker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 180, quality: 0.7 });
      const asset = pick.assets?.[0];
      if (pick.canceled || !asset) return 'canceled';
      const target = await unwrap<VerificationUploadResponse>(await api.progression.trials[':id'].verification.upload.$post({ param: { id: attemptId } }));
      if (asset.fileSize && asset.fileSize > target.maxBytes) throw new ApiError(413, 'That video is over 50 MB. Trim it to the trial itself and try again.');
      const blob = await (await fetch(asset.uri)).blob();
      const put = await fetch(target.uploadUrl, { method: 'PUT', headers: { 'Content-Type': asset.mimeType ?? 'video/mp4', 'x-upsert': 'true' }, body: blob });
      if (!put.ok) throw new ApiError(put.status, 'Upload failed. Check your connection and try again.');
      await unwrap(await api.progression.trials[':id'].verification.$post({ param: { id: attemptId }, json: { videoKey: target.videoKey } }));
      return 'pending';
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: progressionKeys.all }),
  });
}
