import type { CommentDto, HunterCardDto } from '@lb/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActionSheetIOS, Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useComments, useCommunityMe, useCreateComment, useDeleteComment, useHunter, usePost, useReport } from '@/features/community/api';
import { Avatar } from '@/features/community/Avatar';
import { ago, heroColor, PostCard } from '@/features/community/PostCard';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Button, Card, Icon, PressableScale, ScreenHeader, Text } from '@/ui';
import { ScreenBackground } from '@/ui/fx/ScreenBackground';

/** Replies shown under a comment before "View N more replies". */
const REPLIES_SHOWN = 2;
const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'other', label: 'Something else' },
] as const;

/**
 * One post and its discussion (one level of replies): comments as threads, replies collapsed past two,
 * the composer pinned above the keyboard, and sends that appear instantly.
 */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, spacing, radius, type } = useTheme();
  const me = useCommunityMe();
  const comments = useComments(id);
  const create = useCreateComment(id);
  const del = useDeleteComment(id);
  const report = useReport();
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommentDto | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  // lock the send button the moment we stamp an id so a double-tap can't post twice
  const [sending, setSending] = useState(false);

  const postQ = usePost(id);
  const post = postQ.data ?? null;
  const author = useHunter(post && !post.mine && post.commentsMode === 'followers' ? post.author.handle : '');
  const followsAuthor = !!author.data?.iFollow;
  // my own card, so a comment I send shows with my avatar and rank right away
  const mine = useHunter(me.data?.handle ?? '');
  const myCard: HunterCardDto | null = me.data?.handle
    ? mine.data?.hunter ?? { userId: 'me', handle: me.data.handle, heroId: null, heroClass: null, rank: 'E', level: 1, powerLevel: 0, title: null, frame: null, aura: null }
    : null;

  const all = comments.data ?? [];
  const top = all.filter((x) => !x.parentId);
  const repliesOf = (pid: string) => all.filter((x) => x.parentId === pid);
  // mirrors the server rules so the box never offers a comment that would be refused
  const canComment = !!post && post.status === 'visible' && !!me.data?.can.comment && !!myCard
    && (post.mine || post.commentsMode === 'all' || (post.commentsMode === 'followers' && followsAuthor));

  const send = () => {
    const text = body.trim();
    if (!text || !myCard || sending) return;
    setSending(true);
    haptics.tap();
    create.send(text, replyTo?.id ?? null, myCard);
    if (replyTo) setOpen((o) => ({ ...o, [replyTo.id]: true }));
    setBody('');
    setReplyTo(null);
    // unlock after the optimistic row is in; retries reuse the stamped id on the mutation
    requestAnimationFrame(() => setSending(false));
  };

  const startReply = (cm: CommentDto) => {
    setReplyTo(cm);
    input.current?.focus();
  };

  const confirmDelete = (cm: CommentDto) =>
    Alert.alert('Delete comment?', cm.parentId ? 'This reply will be removed.' : 'This comment and its replies will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => del.mutate(cm) },
    ]);

  const doReport = (cm: CommentDto, reason: (typeof REPORT_REASONS)[number]['value']) =>
    report.mutate({ targetType: 'comment', targetId: cm.id, reason }, { onSuccess: () => Alert.alert('Thanks for reporting', 'A moderator will review this comment.') });
  const askReport = (cm: CommentDto) => {
    const labels = REPORT_REASONS.map((r) => r.label);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Report comment', message: 'Why are you reporting this?', options: [...labels, 'Cancel'], cancelButtonIndex: labels.length, destructiveButtonIndex: undefined },
        (i) => { if (i < labels.length) doReport(cm, REPORT_REASONS[i]!.value); },
      );
    } else {
      Alert.alert('Report comment', 'Why are you reporting this?', [
        ...REPORT_REASONS.map((r) => ({ text: r.label, onPress: () => doReport(cm, r.value) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  const refresh = () => {
    setRefreshing(true);
    Promise.all([comments.refetch(), postQ.refetch()]).finally(() => setRefreshing(false));
  };

  const row = (cm: CommentDto, nested = false) => {
    const sending = cm.id.startsWith('sending:');
    return (
      <View key={cm.id} style={{ flexDirection: 'row', gap: spacing[3], opacity: sending ? 0.6 : 1 }}>
        <PressableScale haptic="tap" onPress={() => router.push(`/community/hunter/${cm.author.handle}`)} accessibilityRole="link" accessibilityLabel={`Open @${cm.author.handle}`}>
          <Avatar handle={cm.author.handle} color={heroColor(cm.author)} rank={cm.author.rank} size={nested ? 28 : 34} frame={cm.author.frame} aura={cm.author.aura} />
        </PressableScale>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ backgroundColor: c.surfaceRaised, borderRadius: radius.lg, borderTopLeftRadius: 6, paddingHorizontal: spacing[3], paddingVertical: spacing[2], gap: 2, alignSelf: 'flex-start', maxWidth: '100%' }}>
            <Text variant="caption" style={{ fontFamily: 'Inter_600SemiBold' }}>{`@${cm.author.handle}`}</Text>
            <Text variant="callout">{cm.body}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4], paddingLeft: spacing[2] }}>
            <Text variant="micro" muted>{sending ? 'Sending…' : cm.status === 'pending' ? 'Waiting for review' : ago(cm.createdAt)}</Text>
            {!sending && !nested && canComment ? (
              <PressableScale haptic="tap" onPress={() => startReply(cm)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Reply to @${cm.author.handle}`}>
                <Text variant="micro" color={c.textDim} style={{ fontFamily: 'Inter_600SemiBold' }}>Reply</Text>
              </PressableScale>
            ) : null}
            {sending ? null : cm.mine || post?.mine ? (
              <PressableScale haptic="tap" onPress={() => confirmDelete(cm)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete comment">
                <Text variant="micro" color={c.textMuted}>Delete</Text>
              </PressableScale>
            ) : (
              <PressableScale haptic="tap" onPress={() => askReport(cm)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Report comment">
                <Text variant="micro" color={c.textMuted}>Report</Text>
              </PressableScale>
            )}
          </View>
        </View>
      </View>
    );
  };

  const visibleCount = all.filter((x) => x.status === 'visible' && !x.id.startsWith('sending:')).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScreenHeader title="Post" />
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.textDim} />}
            contentContainerStyle={{ padding: spacing[4], gap: spacing[4], paddingBottom: spacing[8], width: '100%', maxWidth: 560, alignSelf: 'center' }}>
            {post ? <PostCard post={post} canReact={!!me.data?.can.react} showComments={false} /> : null}
            {postQ.isLoading ? <Card><Text dim>Loading post…</Text></Card> : null}
            {postQ.isError && !post ? (
              <Card>
                <Text variant="headline">This post isn’t available</Text>
                <Text variant="callout" dim>It may have been deleted, or you can’t see it.</Text>
                <Button variant="secondary" size="md" label="Back" onPress={() => router.back()} />
              </Card>
            ) : null}

            {post ? (
              <View style={{ gap: spacing[4] }}>
                <Text variant="label" muted>{visibleCount ? `${visibleCount} ${visibleCount === 1 ? 'comment' : 'comments'}` : 'Comments'}</Text>
                {comments.isLoading ? <Text variant="callout" dim>Loading comments…</Text> : null}
                {comments.isError && !comments.data ? (
                  <Button variant="ghost" size="md" icon="refresh" label="Couldn’t load comments · Try again" onPress={() => void comments.refetch()} />
                ) : null}
                {top.map((cm) => {
                  const replies = repliesOf(cm.id);
                  const expanded = open[cm.id] || replies.length <= REPLIES_SHOWN;
                  const shown = expanded ? replies : replies.slice(0, REPLIES_SHOWN);
                  return (
                    <View key={cm.id} style={{ gap: spacing[3] }}>
                      {row(cm)}
                      {shown.length ? (
                        <View style={{ marginLeft: 46, gap: spacing[3] }}>
                          {shown.map((r) => row(r, true))}
                          {!expanded ? (
                            <PressableScale haptic="tap" onPress={() => setOpen((o) => ({ ...o, [cm.id]: true }))} accessibilityRole="button">
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                                <View style={{ width: 20, height: 1, backgroundColor: c.border }} />
                                <Text variant="caption" color={c.textDim}>{`View ${replies.length - REPLIES_SHOWN} more ${replies.length - REPLIES_SHOWN === 1 ? 'reply' : 'replies'}`}</Text>
                              </View>
                            </PressableScale>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {comments.data && !all.length ? (
                  <View style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[6] }}>
                    <Icon name="chatbubble-ellipses-outline" size={28} color={c.textMuted} />
                    <Text variant="callout" muted>{canComment ? 'No comments yet. Start the conversation.' : 'No comments yet.'}</Text>
                  </View>
                ) : null}
                {comments.hasNextPage ? (
                  <Button variant="ghost" size="md" icon="chevron-down"
                    label={comments.isFetchingNextPage ? 'Loading more…' : 'Load more comments'}
                    loading={comments.isFetchingNextPage}
                    onPress={() => void comments.fetchNextPage()} />
                ) : all.length > 0 && !comments.isLoading ? (
                  <Text variant="caption" muted style={{ textAlign: 'center' }}>You’re all caught up</Text>
                ) : null}
                {!canComment && me.data ? (
                  <Text variant="caption" muted style={{ textAlign: 'center' }}>
                    {post.commentsMode === 'off' ? 'Comments are turned off for this post.'
                      : post.commentsMode === 'followers' && !post.mine && !followsAuthor ? 'Only followers can comment on this post.'
                      : post.status !== 'visible' ? 'Comments open once this post is approved.'
                      : !me.data.handle ? 'Pick a hunter handle to comment.'
                      : me.data.nextUnlock ?? 'Comments aren’t available on your account.'}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          {canComment ? (
            <View style={{ paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[2], gap: spacing[2], borderTopWidth: 1, borderColor: c.border, backgroundColor: c.background }}>
              {replyTo ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  <Icon name="return-down-forward" size={14} color={c.textMuted} />
                  <Text variant="caption" muted style={{ flex: 1 }} numberOfLines={1}>{`Replying to @${replyTo.author.handle}`}</Text>
                  <PressableScale haptic="tap" onPress={() => setReplyTo(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel reply">
                    <Icon name="close-circle" size={18} color={c.textMuted} />
                  </PressableScale>
                </View>
              ) : null}
              {create.isError ? <Text variant="caption" color={c.danger}>{`Couldn’t post: ${(create.error as Error).message}`}</Text> : null}
              <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-end' }}>
                {myCard ? <Avatar handle={myCard.handle} color={heroColor(myCard)} size={32} /> : null}
                <TextInput ref={input} value={body} onChangeText={setBody} maxLength={280} multiline
                  placeholder={replyTo ? `Reply to @${replyTo.author.handle}…` : 'Add a comment…'} placeholderTextColor={c.textMuted}
                  accessibilityLabel={replyTo ? 'Reply' : 'Comment'}
                  style={{ flex: 1, minHeight: 40, maxHeight: 120, color: c.text, fontFamily: type.body.font, fontSize: 16, paddingHorizontal: spacing[3], paddingTop: 10, paddingBottom: 10, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} />
                <PressableScale haptic="none" onPress={send} disabled={!body.trim() || sending} accessibilityRole="button" accessibilityLabel="Post comment"
                  style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: body.trim() && !sending ? c.accent : c.surfaceRaised }}>
                  <Icon name="arrow-up" size={20} color={body.trim() && !sending ? '#FFFFFF' : c.textMuted} />
                </PressableScale>
              </View>
              {body.length > 240 ? <Text variant="micro" muted style={{ textAlign: 'right' }}>{`${280 - body.length} left`}</Text> : null}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
