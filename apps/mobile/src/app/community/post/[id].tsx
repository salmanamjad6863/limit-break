import type { CommentDto, FeedResponse, PostDto } from '@lb/contracts';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { useComments, useCommunityMe, useCreateComment, useDeleteComment, useReport } from '@/features/community/api';
import { Avatar } from '@/features/community/Avatar';
import { ago, heroColor, PostCard } from '@/features/community/PostCard';
import { useTheme } from '@/theme';
import { Button, Page, PressableScale, ScreenHeader, Text } from '@/ui';

/** One post with its comments (one level of replies). */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, spacing, radius, type } = useTheme();
  const qc = useQueryClient();
  const me = useCommunityMe();
  const comments = useComments(id);
  const create = useCreateComment(id);
  const del = useDeleteComment(id);
  const report = useReport();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommentDto | null>(null);

  // the post comes from whichever feed or profile opened it
  const post = useMemo(() => {
    for (const [, d] of qc.getQueriesData<InfiniteData<FeedResponse>>({ queryKey: ['community', 'feed'] })) {
      const p = d?.pages.flatMap((pg) => pg.posts).find((x) => x.id === id);
      if (p) return p;
    }
    for (const [, d] of qc.getQueriesData<{ posts: PostDto[] }>({ queryKey: ['community', 'hunter'] })) {
      const p = d?.posts.find((x) => x.id === id);
      if (p) return p;
    }
    return null;
  }, [qc, id]);

  const top = (comments.data ?? []).filter((x) => !x.parentId);
  const replies = (pid: string) => (comments.data ?? []).filter((x) => x.parentId === pid);
  const canComment = !!me.data?.can.comment && post?.commentsMode !== 'off';

  const row = (cm: CommentDto, nested = false) => (
    <View key={cm.id} style={{ flexDirection: 'row', gap: spacing[2], marginLeft: nested ? spacing[8] : 0 }}>
      <Avatar handle={cm.author.handle} color={heroColor(cm.author)} size={30} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" muted>{`@${cm.author.handle} · ${ago(cm.createdAt)}${cm.status === 'pending' ? ' · waiting for review' : ''}`}</Text>
        <Text variant="callout">{cm.body}</Text>
        <View style={{ flexDirection: 'row', gap: spacing[4] }}>
          {!nested && canComment ? <PressableScale haptic="tap" onPress={() => setReplyTo(cm)}><Text variant="caption" color={c.accentGlow}>Reply</Text></PressableScale> : null}
          {cm.mine || post?.mine ? (
            <PressableScale haptic="tap" onPress={() => del.mutate(cm)}><Text variant="caption" muted>Delete</Text></PressableScale>
          ) : (
            <PressableScale haptic="tap" onPress={() => report.mutate({ targetType: 'comment', targetId: cm.id, reason: 'other' }, { onSuccess: () => Alert.alert('Reported', 'Thanks. A moderator will review it.') })}>
              <Text variant="caption" muted>Report</Text>
            </PressableScale>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Page header={<ScreenHeader title="Post" />}
        footer={canComment ? (
          <View style={{ padding: spacing[3], gap: spacing[2], borderTopWidth: 1, borderColor: c.border, backgroundColor: c.background }}>
            {replyTo ? (
              <PressableScale haptic="tap" onPress={() => setReplyTo(null)}><Text variant="caption" muted>{`Replying to @${replyTo.author.handle} · cancel`}</Text></PressableScale>
            ) : null}
            {create.isError ? <Text variant="caption" color={c.danger}>{(create.error as Error).message}</Text> : null}
            <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-end' }}>
              <TextInput value={body} onChangeText={setBody} placeholder="Add a comment" placeholderTextColor={c.textMuted} maxLength={280} multiline
                style={{ flex: 1, maxHeight: 120, color: c.text, fontFamily: type.body.font, fontSize: 16, padding: spacing[2], borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} />
              <Button size="md" label="Send" loading={create.isPending} disabled={!body.trim()}
                onPress={() => create.mutate({ body: body.trim(), parentId: replyTo?.id ?? null }, { onSuccess: () => { setBody(''); setReplyTo(null); } })} />
            </View>
          </View>
        ) : undefined}>
        {post ? <PostCard post={post} canReact={!!me.data?.can.react} showComments={false} /> : null}
        {comments.isLoading ? <Text dim>Loading comments…</Text> : null}
        {comments.isError ? <Text color={c.danger}>This post isn’t available.</Text> : null}
        {top.map((cm) => (
          <View key={cm.id} style={{ gap: spacing[3] }}>
            {row(cm)}
            {replies(cm.id).map((r) => row(r, true))}
          </View>
        ))}
        {comments.data && !comments.data.length ? <Text dim>No comments yet.</Text> : null}
        {!canComment && me.data ? (
          <Text variant="caption" muted>{post?.commentsMode === 'off' ? 'Comments are turned off.' : me.data.nextUnlock ?? 'Comments aren’t available on your account.'}</Text>
        ) : null}
        {!post && !comments.isLoading ? <Button variant="ghost" label="Back" onPress={() => router.back()} /> : null}
      </Page>
    </KeyboardAvoidingView>
  );
}
