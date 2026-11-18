import type { ProgressPhotoKind } from '@lb/contracts';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';
import { useCreateProgressPhoto, useDeleteProgressPhoto, useProgressPhotos } from '@/features/depth';
import { useGameDate } from '@/features/nutrition';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';
import { Segmented, TextField } from '@/ui/form';

/** Private progress photo vault (SYSTEMS.md §6.1). Never appears in community payloads. */
export default function ProgressPhotosScreen() {
  const { c, spacing, radius } = useTheme();
  const today = useGameDate();
  const { data, isLoading } = useProgressPhotos();
  const create = useCreateProgressPhoto();
  const del = useDeleteProgressPhoto();
  const [kind, setKind] = useState<ProgressPhotoKind>('progress');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function pick(from: 'camera' | 'library') {
    setError(null);
    const res =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    try {
      await create.mutateAsync({
        uri: a.uri,
        localDate: today,
        kind,
        width: a.width || 1,
        height: a.height || 1,
        note: note.trim() || null,
        takenAt: new Date().toISOString(),
      });
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    }
  }

  const photos = data?.photos ?? [];

  return (
    <Page header={<ScreenHeader title="Progress photos" />}>
      <Card>
        <Text variant="callout" dim>These stay in a private bucket. Tag one Before and one After for the Awakening frame.</Text>
        <Segmented
          options={[
            { value: 'progress', label: 'Progress' },
            { value: 'before', label: 'Before' },
            { value: 'after', label: 'After' },
          ]}
          value={kind}
          onChange={(v) => setKind(v as ProgressPhotoKind)}
        />
        <TextField label="Note (optional)" placeholder="e.g. week 8 lighting" value={note} onChangeText={setNote} />
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <View style={{ flex: 1 }}>
            <Button size="md" variant="secondary" icon="camera-outline" label="Camera" loading={create.isPending} onPress={() => void pick('camera')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button size="md" icon="images-outline" label="Library" loading={create.isPending} onPress={() => void pick('library')} />
          </View>
        </View>
        {error ? <Text variant="caption" color={c.warning}>{error}</Text> : null}
      </Card>

      <SectionHeader title={photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : 'Vault'} />
      {isLoading ? <Text dim>Loading…</Text> : null}
      {!isLoading && !photos.length ? <Text variant="caption" muted>No photos yet.</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {photos.map((p) => (
          <View key={p.id} style={{ width: '48%', gap: spacing[1] }}>
            <View style={{ aspectRatio: 3 / 4, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.surfaceRaised }}>
              {p.url ? (
                <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="image-outline" size={28} color={c.textMuted} />
                </View>
              )}
            </View>
            <Text variant="caption" muted>{`${p.localDate} · ${p.kind}`}</Text>
            <PressableScale haptic="tap" onPress={() => del.mutate(p.id)} accessibilityRole="button" accessibilityLabel="Delete photo">
              <Text variant="caption" color={c.danger}>Delete</Text>
            </PressableScale>
          </View>
        ))}
      </View>
    </Page>
  );
}
