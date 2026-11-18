import type { SignPostMediaResponse } from '@lb/contracts';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { unwrapCommunity, useCommunityMe, useCreatePost } from '@/features/community/api';
import { useWorkoutHistory } from '@/features/training/history';
import { api } from '@/lib/api';
import { newId } from '@/lib/id';
import { useTheme } from '@/theme';
import { Button, Page, PressableScale, ScreenHeader, Text } from '@/ui';
import { Segmented } from '@/ui/form';

const MAX = 500;

type PendingPhoto = { id: string; uri: string; width: number; height: number; storageKey?: string };

/** Progress post: text + optional workout card + up to 4 photos (Trusted / T2). */
export default function Compose() {
  const { c, spacing, radius, type } = useTheme();
  const me = useCommunityMe();
  const create = useCreatePost();
  const { workouts } = useWorkoutHistory();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('followers');
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canPublic = !!me.data?.can.postPublic;
  const canPhotos = canPublic; // T2: public posts with photos

  async function addPhotos() {
    setError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.max(0, 4 - photos.length), quality: 0.85,
    });
    if (picked.canceled) return;
    const next = picked.assets.slice(0, 4 - photos.length).map((a) => ({
      id: newId(), uri: a.uri, width: a.width || 1, height: a.height || 1,
    }));
    setPhotos((p) => [...p, ...next].slice(0, 4));
  }

  async function uploadAll(list: PendingPhoto[]) {
    const out: { id: string; storageKey: string; width: number; height: number }[] = [];
    for (const p of list) {
      if (p.storageKey) {
        out.push({ id: p.id, storageKey: p.storageKey, width: p.width, height: p.height });
        continue;
      }
      const signed = await unwrapCommunity<SignPostMediaResponse>(await api.community.media.sign.$post({ json: { id: p.id } }));
      const blob = await (await fetch(p.uri)).blob();
      if (blob.size > signed.maxBytes) throw new Error('A photo is too large (max 8 MB).');
      const res = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (!res.ok) throw new Error('Photo upload failed. Try again.');
      out.push({ id: p.id, storageKey: signed.storageKey, width: p.width, height: p.height });
    }
    return out;
  }

  return (
    <Page header={<ScreenHeader title="Share progress" icon="close" />}>
      <TextInput value={body} onChangeText={setBody} placeholder="What did you conquer today?" placeholderTextColor={c.textMuted} multiline maxLength={MAX} autoFocus
        style={{ minHeight: 140, color: c.text, fontFamily: type.body.font, fontSize: 17, textAlignVertical: 'top', padding: spacing[3], borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} />
      <Text variant="caption" muted style={{ textAlign: 'right' }}>{`${body.length}/${MAX}`}</Text>

      <Text variant="label" dim>Who can see it</Text>
      <Segmented
        options={[...(canPublic ? [{ value: 'public' as const, label: 'Public' }] : []), { value: 'followers' as const, label: 'Followers' }, { value: 'private' as const, label: 'Only me' }]}
        value={visibility} onChange={setVisibility} />
      {!canPublic ? <Text variant="caption" muted>Public posts unlock at Trusted: level 10 and an account 14 days old.</Text> : null}

      {canPhotos ? (
        <View style={{ gap: spacing[2] }}>
          <Text variant="label" dim>Photos (optional, max 4)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {photos.map((p) => (
              <PressableScale key={p.id} haptic="tap" onPress={() => setPhotos((all) => all.filter((x) => x.id !== p.id))} accessibilityLabel="Remove photo"
                style={{ width: 72, height: 72, borderRadius: radius.md, overflow: 'hidden' }}>
                <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              </PressableScale>
            ))}
            {photos.length < 4 ? (
              <Button size="md" variant="secondary" icon="image-outline" label="Add" onPress={() => void addPhotos()} />
            ) : null}
          </View>
          <Text variant="caption" muted>Never include body weight on photos. Tap a thumbnail to remove it.</Text>
        </View>
      ) : null}

      {workouts.length ? (
        <View style={{ gap: spacing[2] }}>
          <Text variant="label" dim>Attach a workout (optional)</Text>
          {workouts.slice(0, 5).map((w) => {
            const on = workoutId === w.id;
            return (
              <PressableScale key={w.id} haptic="tap" onPress={() => setWorkoutId(on ? null : w.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing[3], borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? c.accent : c.border, backgroundColor: on ? `${c.accent}1A` : c.surface }}>
                <Text variant="callout">{w.name}</Text>
                <Text variant="caption" dim>{`${w.date} · ${w.workingSets} sets`}</Text>
              </PressableScale>
            );
          })}
          <Text variant="caption" muted>Cards show exercises, sets and PRs. Never your body weight.</Text>
        </View>
      ) : null}

      {(error || create.isError) ? <Text variant="caption" color={c.danger}>{error ?? (create.error as Error).message}</Text> : null}
      <Button label="Post" loading={create.isPending || uploading} disabled={!body.trim()}
        onPress={() => {
          void (async () => {
            try {
              setUploading(true); setError(null);
              const media = photos.length ? await uploadAll(photos) : [];
              create.mutate({ body: body.trim(), visibility, commentsMode: 'all', workoutId, media }, { onSuccess: () => router.back() });
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Couldn’t upload photos');
            } finally {
              setUploading(false);
            }
          })();
        }} />
      <Text variant="caption" muted>Posts are checked before others see them. Be kind: no insults, links, ads or personal details.</Text>
    </Page>
  );
}
