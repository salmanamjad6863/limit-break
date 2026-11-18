import { Handle } from '@lb/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useCommunityMe, useUpdateCommunityProfile } from '@/features/community/api';
import { useTheme } from '@/theme';
import { Button, Page, ScreenHeader, Text } from '@/ui';
import { TextField } from '@/ui/form';

/** Pick (or change) the public handle, bio and profile visibility. Never the real name. */
export default function HandleScreen() {
  const { c, spacing } = useTheme();
  const me = useCommunityMe();
  const save = useUpdateCommunityProfile();
  const [handle, setHandle] = useState(me.data?.handle ?? '');
  const [bio, setBio] = useState(me.data?.bio ?? '');
  const [isPublic, setPublic] = useState(me.data?.isPublic ?? true);
  const parsed = Handle.safeParse(handle);
  const first = !me.data?.handle;

  return (
    <Page header={<ScreenHeader title={first ? 'Join the community' : 'Community profile'} icon="close" />}>
      <Text dim>Other hunters see your handle, hero, class, rank and Power Level. Never your real name, weight, food or location.</Text>
      <TextField label="Handle" value={handle} onChangeText={(v) => setHandle(v.replace(/\s/g, '').toLowerCase())} placeholder="kaze.runs"
        autoCapitalize="none" autoCorrect={false} maxLength={20} />
      <Text variant="caption" color={handle && !parsed.success ? c.danger : c.textMuted}>
        {handle && !parsed.success ? parsed.error.issues[0]?.message : '3–20 letters, numbers, "_" or "."'}
      </Text>
      <TextField label="Bio (optional)" value={bio} onChangeText={setBio} placeholder="Training for my first 10K" maxLength={160} multiline />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ flex: 1 }}>
          <Text variant="callout">Public profile</Text>
          <Text variant="caption" muted>Off: only followers see your posts, and you don’t appear on the boards.</Text>
        </View>
        <Switch value={isPublic && !me.data?.isMinor} onValueChange={setPublic} disabled={me.data?.isMinor} />
      </View>
      {me.data?.isMinor ? <Text variant="caption" muted>Profiles of hunters under 18 are always private.</Text> : null}
      {save.isError ? <Text variant="caption" color={c.danger}>{(save.error as Error).message}</Text> : null}
      <Button label={first ? 'Join' : 'Save'} loading={save.isPending} disabled={!parsed.success}
        onPress={() => save.mutate({ ...(parsed.success && parsed.data !== me.data?.handle ? { handle: parsed.data } : {}), bio: bio.trim() || null, isPublic }, { onSuccess: () => router.back() })} />
    </Page>
  );
}
