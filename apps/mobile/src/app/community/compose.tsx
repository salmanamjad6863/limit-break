import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useCommunityMe, useCreatePost } from '@/features/community/api';
import { useWorkoutHistory } from '@/features/training/history';
import { useTheme } from '@/theme';
import { Button, Page, PressableScale, ScreenHeader, Text } from '@/ui';
import { Segmented } from '@/ui/form';

const MAX = 500;

/** Progress post: up to 500 characters + an optional workout card. Moderated before anyone else sees it. */
export default function Compose() {
  const { c, spacing, radius, type } = useTheme();
  const me = useCommunityMe();
  const create = useCreatePost();
  const { workouts } = useWorkoutHistory();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('followers');
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const canPublic = !!me.data?.can.postPublic;

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

      {create.isError ? <Text variant="caption" color={c.danger}>{(create.error as Error).message}</Text> : null}
      <Button label="Post" loading={create.isPending} disabled={!body.trim()}
        onPress={() => create.mutate({ body: body.trim(), visibility, commentsMode: 'all', workoutId }, { onSuccess: () => router.back() })} />
      <Text variant="caption" muted>Posts are checked before others see them. Be kind: no insults, links, ads or personal details.</Text>
    </Page>
  );
}
