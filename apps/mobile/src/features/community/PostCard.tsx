import { heroes } from '@lb/content';
import type { HunterCardDto, PostDto, Sticker } from '@lb/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, View } from 'react-native';
import { exerciseName } from '@/features/training/catalog';
import { useTheme } from '@/theme';
import { Card, Icon, type IconName, PressableScale, Text } from '@/ui';
import { useBlock, useDeletePost, useReact, useReport } from './api';
import { Avatar } from './Avatar';

export const STICKER_META: Record<Sticker, { label: string; icon: IconName; color: string }> = {
  respect: { label: 'Respect', icon: 'flame', color: '#FF9F43' },
  limit_broken: { label: 'Limit Broken', icon: 'flash', color: '#F5C451' },
  ganbatte: { label: 'Ganbatte!', icon: 'heart', color: '#FF4D6D' },
  beast_mode: { label: 'Beast Mode', icon: 'barbell', color: '#A893FF' },
  nice_form: { label: 'Nice form', icon: 'checkmark-circle', color: '#3DDC97' },
  lets_go: { label: "Let's go", icon: 'rocket', color: '#38C6F4' },
};

export const heroColor = (h: Pick<HunterCardDto, 'heroId'>) => heroes.find((x) => x.id === h.heroId)?.accent ?? '#8B5CF6';

export function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function milestoneText(p: PostDto): { icon: IconName; title: string; body: string } | null {
  const m = p.milestone;
  if (!m) return null;
  switch (m.kind) {
    case 'rank_up': return { icon: 'ribbon', title: `Promoted to ${m.to}-Rank`, body: `Passed the ${m.to}-Rank Trial.` };
    case 'pr': return { icon: 'trophy', title: 'New personal record', body: `${exerciseName(m.exerciseId)}: estimated 1RM ${m.e1rmKg} kg` };
    case 'level': return { icon: 'trending-up', title: `Reached level ${m.level}`, body: 'Another step on the ladder.' };
    case 'streak': return { icon: 'flame', title: `${m.days}-day streak`, body: `${m.days} days of Daily Quests without a break.` };
  }
}

/** Report / block / delete, from the "…" button. */
function usePostMenu(post: PostDto) {
  const report = useReport();
  const block = useBlock();
  const del = useDeletePost();
  return () => {
    const actions = post.mine
      ? [{ label: 'Delete post', destructive: true, run: () => del.mutate(post.id) }]
      : [
          { label: 'Report post', destructive: false, run: () => report.mutate({ targetType: 'post', targetId: post.id, reason: 'other' }, { onSuccess: () => Alert.alert('Reported', 'Thanks. A moderator will review it.') }) },
          {
            label: `Block @${post.author.handle}`, destructive: true,
            run: () => Alert.alert(`Block @${post.author.handle}?`, 'You won’t see each other’s posts, comments or profiles. They aren’t told.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Block', style: 'destructive', onPress: () => block.mutate(post.author.userId) },
            ]),
          },
        ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...actions.map((a) => a.label), 'Cancel'], cancelButtonIndex: actions.length, destructiveButtonIndex: actions.findIndex((a) => a.destructive) },
        (i) => actions[i]?.run(),
      );
    } else {
      Alert.alert('Post', undefined, [...actions.map((a) => ({ text: a.label, style: a.destructive ? ('destructive' as const) : ('default' as const), onPress: a.run })), { text: 'Cancel', style: 'cancel' as const }]);
    }
  };
}

export function PostCard({ post, canReact, showComments = true }: { post: PostDto; canReact: boolean; showComments?: boolean }) {
  const { c, spacing, radius } = useTheme();
  const react = useReact();
  const menu = usePostMenu(post);
  const [picking, setPicking] = useState(false);
  const color = heroColor(post.author);
  const ms = milestoneText(post);
  const mine = post.myReaction ? STICKER_META[post.myReaction] : null;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <PressableScale haptic="tap" onPress={() => router.push(`/community/hunter/${post.author.handle}`)} accessibilityRole="link" accessibilityLabel={`Open @${post.author.handle}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 }}>
          <Avatar handle={post.author.handle} color={color} rank={post.author.rank} />
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={1}>{`@${post.author.handle}`}</Text>
            <Text variant="caption" muted>{`${ago(post.createdAt)} · Lv ${post.author.level}${post.visibility === 'followers' ? ' · Followers' : post.visibility === 'private' ? ' · Only me' : ''}`}</Text>
          </View>
        </PressableScale>
        <PressableScale haptic="tap" onPress={menu} accessibilityRole="button" accessibilityLabel="Post options" hitSlop={10}>
          <Icon name="ellipsis-horizontal" size={18} color={c.textMuted} />
        </PressableScale>
      </View>

      {post.status === 'pending' ? (
        <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center', padding: spacing[2], borderRadius: radius.sm, backgroundColor: `${c.warning}1A` }}>
          <Icon name="time-outline" size={16} color={c.warning} />
          <Text variant="caption" color={c.warning} style={{ flex: 1 }}>Waiting for review. Only you can see this for now.</Text>
        </View>
      ) : post.status === 'hidden' ? (
        <Text variant="caption" color={c.danger}>Hidden by a moderator. Only you can see this.</Text>
      ) : null}

      {ms ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Icon name={ms.icon} size={18} color={ms.icon === 'trophy' ? '#F5C451' : color} />
          <Text variant="heading">{ms.title}</Text>
        </View>
      ) : null}
      <Text variant="body">{post.body ?? ms?.body ?? ''}</Text>

      {post.workout ? (
        <View style={{ padding: spacing[3], borderRadius: radius.md, backgroundColor: c.surfaceRaised, gap: spacing[1] }}>
          <Text variant="callout">{post.workout.name}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" dim>{`${post.workout.minutes} min`}</Text>
            <Text variant="caption" dim>{`${post.workout.workingSets} sets`}</Text>
            {post.workout.volumeKg ? <Text variant="caption" dim>{`${post.workout.volumeKg.toLocaleString()} kg volume`}</Text> : null}
            {post.workout.prs.length ? <Text variant="caption" color="#F5C451">{`${post.workout.prs.length} PR`}</Text> : null}
          </View>
        </View>
      ) : null}

      {picking ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {(Object.keys(STICKER_META) as Sticker[]).map((s) => (
            <PressableScale key={s} haptic="press" onPress={() => { setPicking(false); react.mutate({ post, sticker: post.myReaction === s ? null : s }); }}
              accessibilityRole="button" accessibilityLabel={STICKER_META[s].label}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing[2], paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: post.myReaction === s ? STICKER_META[s].color : c.border, backgroundColor: c.surface }}>
              <Icon name={STICKER_META[s].icon} size={14} color={STICKER_META[s].color} />
              <Text variant="caption">{STICKER_META[s].label}</Text>
            </PressableScale>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[5], marginTop: spacing[1] }}>
        <PressableScale haptic="tap" disabled={!canReact || post.status !== 'visible'}
          onPress={() => react.mutate({ post, sticker: post.myReaction ? null : 'respect' })}
          onLongPress={() => setPicking((v) => !v)}
          accessibilityRole="button" accessibilityLabel={mine ? `Remove ${mine.label}` : 'Give Respect (long-press for more)'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={mine ? mine.icon : 'flame-outline'} size={19} color={mine ? mine.color : c.textDim} />
          <Text variant="callout" color={mine ? mine.color : c.textDim}>{`${post.respectCount} Respect`}</Text>
        </PressableScale>
        {showComments && post.commentsMode !== 'off' ? (
          <PressableScale haptic="tap" onPress={() => router.push(`/community/post/${post.id}`)} accessibilityRole="button" accessibilityLabel="Comments"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="chatbubble-outline" size={18} />
            <Text variant="callout" dim>{post.commentCount}</Text>
          </PressableScale>
        ) : null}
        <View style={{ flex: 1 }} />
        {canReact && post.status === 'visible' ? (
          <PressableScale haptic="tap" onPress={() => setPicking((v) => !v)} accessibilityRole="button" accessibilityLabel="More reactions">
            <Icon name="happy-outline" size={19} />
          </PressableScale>
        ) : null}
      </View>
    </Card>
  );
}
