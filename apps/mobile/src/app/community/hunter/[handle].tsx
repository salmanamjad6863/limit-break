import { heroes } from '@lb/content';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';
import { useBlock, useCommunityMe, useFollow, useHunter, useReport } from '@/features/community/api';
import { Avatar } from '@/features/community/Avatar';
import { heroColor, PostCard } from '@/features/community/PostCard';
import { useOpenConversation } from '@/features/social/api';
import { useTheme } from '@/theme';
import { Button, Card, Page, Pill, ScreenHeader, Text } from '@/ui';

/** A hunter's public profile: handle, hero, rank, Power Level, bio, posts. */
export default function HunterScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { c, spacing } = useTheme();
  const me = useCommunityMe();
  const q = useHunter(handle);
  const follow = useFollow();
  const block = useBlock();
  const report = useReport();
  const dm = useOpenConversation();
  const h = q.data?.hunter;
  const isMe = !!h && me.data?.handle === h.handle;
  const hero = heroes.find((x) => x.id === h?.heroId);
  const canDm = !!q.data?.iFollow && !!q.data?.followsMe && !me.data?.isGuest && !me.data?.isMinor;

  return (
    <Page header={<ScreenHeader title={h ? `@${h.handle}` : ''} />}>
      {q.isLoading ? <Text dim>Loading…</Text> : null}
      {q.isError ? <Text color={c.danger}>This hunter isn’t available.</Text> : null}
      {h ? (
        <>
          <Card tint={heroColor(h)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <Avatar handle={h.handle} color={heroColor(h)} rank={h.rank} size={64} frame={h.frame} aura={h.aura} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="title">{`@${h.handle}`}</Text>
                {h.title ? <Text variant="caption" color={c.accentGlow} style={{ letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' }}>{h.title.toUpperCase()}</Text> : null}
                <Text variant="caption" dim>{hero ? `${hero.name} · ${hero.epithet}` : h.heroClass ?? ''}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
              <Pill label={`${h.rank}-Rank`} />
              <Pill label={`Lv ${h.level}`} />
              <Pill icon="flash" label={`PL ${h.powerLevel.toLocaleString()}`} />
            </View>
            {q.data?.bio ? <Text variant="callout">{q.data.bio}</Text> : null}
            <Text variant="caption" muted>{`${q.data?.followers ?? 0} followers · ${q.data?.following ?? 0} following${q.data?.followsMe ? ' · follows you' : ''}`}</Text>
            {isMe ? (
              <Button variant="secondary" size="md" label="Edit community profile" onPress={() => router.push('/community/handle')} />
            ) : me.data?.can.follow ? (
              <View style={{ gap: spacing[2] }}>
                <Button size="md" variant={q.data?.iFollow ? 'secondary' : 'primary'} label={q.data?.iFollow ? 'Following' : 'Follow'} loading={follow.isPending}
                  onPress={() => follow.mutate({ userId: h.userId, follow: !q.data?.iFollow })} />
                {canDm ? (
                  <Button size="md" variant="secondary" icon="chatbubble-outline" label="Message" loading={dm.isPending}
                    onPress={() => dm.mutate(h.userId, { onSuccess: (convo) => router.push(`/social/messages/${convo.id}`) })} />
                ) : null}
              </View>
            ) : null}
            {follow.isError ? <Text variant="caption" color={c.danger}>{(follow.error as Error).message}</Text> : null}
            {dm.isError ? <Text variant="caption" color={c.danger}>{(dm.error as Error).message}</Text> : null}
          </Card>

          {q.data?.posts.map((p) => <PostCard key={p.id} post={p} canReact={!!me.data?.can.react} />)}
          {q.data && !q.data.posts.length ? <Text dim>No posts to show.</Text> : null}

          {!isMe && me.data && !me.data.isGuest ? (
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <View style={{ flex: 1 }}>
                <Button variant="ghost" size="md" label="Report" onPress={() => report.mutate({ targetType: 'profile', targetId: h.userId, reason: 'other' }, { onSuccess: () => Alert.alert('Reported', 'Thanks. A moderator will review it.') })} />
              </View>
              <View style={{ flex: 1 }}>
                <Button variant="ghost" size="md" label="Block"
                  onPress={() => Alert.alert(`Block @${h.handle}?`, 'You won’t see each other’s posts, comments or profiles. They aren’t told.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Block', style: 'destructive', onPress: () => block.mutate(h.userId, { onSuccess: () => router.back() }) },
                  ])} />
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
