/**
 * The real community for signed-in hunters: The Hall (feed) and Top Hunters (monthly boards).
 */
import type { BoardId, Division, FeedTab } from '@lb/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/features/session';
import { useTheme } from '@/theme';
import { Appear, Button, Card, Icon, PressableScale, Text } from '@/ui';
import { useBoard, useCommunityMe, useFeed } from './api';
import { Avatar } from './Avatar';
import { BOARDS, type Rank } from './demo';
import { heroColor, PostCard } from './PostCard';

/** Guests save their account first; everyone else picks a handle once. */
function JoinCard() {
  const { c } = useTheme();
  const isGuest = useSession((s) => s.isGuest);
  const me = useCommunityMe();
  if (isGuest) {
    return (
      <Card tint={c.accent}>
        <Text variant="headline">Join the Hall</Text>
        <Text variant="callout" dim>Save your account to post, react, comment and appear on the boards. You can read everything as a guest.</Text>
        <Button size="md" label="Save your progress" onPress={() => router.push('/sign-in?mode=save')} />
      </Card>
    );
  }
  if (me.data && !me.data.handle) {
    return (
      <Card tint={c.accent}>
        <Text variant="headline">Pick your hunter handle</Text>
        <Text variant="callout" dim>Your handle is how other hunters see you. Never your real name.</Text>
        <Button size="md" label="Choose a handle" onPress={() => router.push('/community/handle')} />
      </Card>
    );
  }
  return null;
}

export function LiveHall({ endReachedRef }: { endReachedRef?: { current: (() => void) | null } }) {
  const { c, spacing, radius } = useTheme();
  const [tab, setTab] = useState<FeedTab>('global');
  const me = useCommunityMe();
  const feed = useFeed(tab);
  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];
  const canPost = !!me.data?.can.post;
  // the screen's scroll asks for the next page near the bottom (infinite feed, no "Load more" tapping)
  useEffect(() => {
    if (!endReachedRef) return;
    endReachedRef.current = () => { if (feed.hasNextPage && !feed.isFetchingNextPage && !feed.isError) void feed.fetchNextPage(); };
    return () => { endReachedRef.current = null; };
  }, [endReachedRef, feed]);

  return (
    <>
      <JoinCard />
      {me.data?.handle ? (
        <Appear index={2}>
          <PressableScale haptic="tap" disabled={!canPost} onPress={() => router.push('/community/compose')} accessibilityRole="button" accessibilityLabel="Share your progress"
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, opacity: canPost ? 1 : 0.7 }}>
            <Avatar handle={me.data.handle} color={c.accent} size={36} />
            <Text variant="callout" muted style={{ flex: 1 }}>{canPost ? 'Share your progress…' : me.data.nextUnlock ?? 'Posting isn’t available yet'}</Text>
            <Icon name="barbell-outline" size={20} />
          </PressableScale>
        </Appear>
      ) : null}
      <Appear index={3} style={{ flexDirection: 'row', gap: spacing[2] }}>
        {([['following', 'Following'], ['global', 'Global'], ['rank', 'My rank']] as const).map(([v, l]) => (
          <PressableScale key={v} haptic="tap" onPress={() => setTab(v)} accessibilityRole="tab" accessibilityState={{ selected: tab === v }}
            style={{ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.pill, backgroundColor: tab === v ? c.surfaceRaised : 'transparent', borderWidth: 1, borderColor: tab === v ? c.borderStrong : 'transparent' }}>
            <Text variant="callout" color={tab === v ? c.text : c.textDim}>{l}</Text>
          </PressableScale>
        ))}
        <View style={{ flex: 1 }} />
        {me.data?.handle ? (
          <PressableScale haptic="tap" onPress={() => router.push(`/community/hunter/${me.data!.handle}`)} accessibilityRole="button" accessibilityLabel="My community profile">
            <Icon name="person-circle-outline" size={26} />
          </PressableScale>
        ) : null}
      </Appear>

      {feed.isLoading ? <><PostSkeleton /><PostSkeleton /><PostSkeleton /></> : null}
      {feed.isError && !posts.length ? (
        <Card>
          <Text variant="headline">Couldn’t load the Hall</Text>
          <Text variant="callout" dim>Check your connection. Pull down to refresh, or try again.</Text>
          <Button variant="secondary" size="md" icon="refresh" label="Try again" loading={feed.isFetching} onPress={() => void feed.refetch()} />
        </Card>
      ) : null}
      {posts.map((p) => <PostCard key={p.id} post={p} canReact={!!me.data?.can.react} />)}
      {feed.data && !posts.length ? (
        <Card>
          <Text variant="heading">{tab === 'following' ? 'Follow hunters to fill this feed' : 'Quiet in the Hall'}</Text>
          <Text variant="callout" dim>{tab === 'following' ? 'Open a hunter from Global and tap Follow. Your own posts show here too.' : 'Be the first: finish a workout and share it.'}</Text>
        </Card>
      ) : null}
      {feed.isFetchingNextPage ? <PostSkeleton /> : null}
      {feed.isFetchNextPageError ? (
        <Button variant="ghost" size="md" icon="refresh" label="Couldn’t load more · Try again" onPress={() => void feed.fetchNextPage()} />
      ) : null}
      {posts.length > 0 && !feed.hasNextPage && !feed.isFetching ? <Text variant="caption" muted style={{ textAlign: 'center' }}>You’re all caught up.</Text> : null}
    </>
  );
}

const DIVISIONS: { value: Division; label: string }[] = [
  { value: 'all', label: 'All ranks' }, { value: 'ED', label: 'E–D' }, { value: 'CB', label: 'C–B' }, { value: 'AS', label: 'A–S' },
];

export function LiveTopHunters() {
  const { c, spacing, radius } = useTheme();
  const [board, setBoard] = useState<BoardId>('consistent');
  const [division, setDivision] = useState<Division>('all');
  const q = useBoard(board, division);
  const meta = BOARDS.find((b) => b.id === board)!;
  type ViewRow = { place: number; handle: string; color: string; rank: Rank; score: number };
  const view: { rows: ViewRow[]; me: { place: number; score: number } | null } | null = q.data
    ? {
      rows: q.data.rows.map((r) => ({ place: r.place, handle: r.hunter.handle, color: heroColor(r.hunter), rank: r.hunter.rank as Rank, score: r.score })),
      me: q.data.me ? { place: q.data.me.place, score: q.data.me.score } : null,
    }
    : null;
  const month = new Date().toLocaleString('en', { month: 'long' });
  const fmt = (v: number) => `${v % 1 ? v.toFixed(1) : v.toLocaleString()}${meta.unit}`;
  const chip = (on: boolean) => ({
    paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: on ? `${c.accent}26` : c.surface, borderWidth: 1, borderColor: on ? c.accent : c.border,
  });

  return (
    <>
      <Appear index={2}>
        <Text variant="headline">{`Top Hunters · ${month}`}</Text>
        <Text variant="caption" muted>{q.data?.final ? 'Final results' : 'Live standings · refresh every 15 min · final on the 3rd'}</Text>
      </Appear>
      <Appear index={3} style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
        {BOARDS.map((b) => (
          <PressableScale key={b.id} haptic="tap" onPress={() => setBoard(b.id)} accessibilityRole="tab" accessibilityState={{ selected: board === b.id }} style={chip(board === b.id)}>
            <Text variant="callout" color={board === b.id ? c.text : c.textDim}>{b.label}</Text>
          </PressableScale>
        ))}
      </Appear>
      <Appear index={4} style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
        {DIVISIONS.map((d) => (
          <PressableScale key={d.value} haptic="tap" onPress={() => setDivision(d.value)} accessibilityRole="tab" accessibilityState={{ selected: division === d.value }} style={chip(division === d.value)}>
            <Text variant="caption" color={division === d.value ? c.text : c.textDim}>{d.label}</Text>
          </PressableScale>
        ))}
      </Appear>

      {q.isLoading ? <BoardSkeleton /> : null}
      {q.isError && !q.data ? (
        <Card>
          <Text variant="headline">Couldn’t load the boards</Text>
          <Button variant="secondary" size="md" icon="refresh" label="Try again" loading={q.isFetching} onPress={() => void q.refetch()} />
        </Card>
      ) : null}
      {view ? (
        <>
          {view.rows.length >= 3 ? <Podium rows={view.rows.slice(0, 3)} fmt={fmt} onOpen={(h) => router.push(`/community/hunter/${h}`)} /> : null}
          <Card padded={false}>
            {view.rows.length ? view.rows.slice(view.rows.length >= 3 ? 3 : 0, 50).map((r, i) => (
              <PressableScale key={r.handle} haptic="tap" onPress={() => router.push(`/community/hunter/${r.handle}`)}
                accessibilityRole="button" accessibilityLabel={`${r.place}. @${r.handle}, ${fmt(r.score)}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                <Text variant="callout" color={c.textMuted} style={{ width: 28 }}>{r.place}</Text>
                <Avatar handle={r.handle} color={r.color} rank={r.rank} size={34} />
                <Text variant="callout" style={{ flex: 1 }} numberOfLines={1}>{`@${r.handle}`}</Text>
                <Text variant="callout">{fmt(r.score)}</Text>
              </PressableScale>
            )) : (
              <View style={{ padding: spacing[4] }}>
                <Text variant="callout" dim>{board === 'improved' ? q.data?.meIneligible : 'No eligible hunters on this board yet this month.'}</Text>
              </View>
            )}
            {view.me ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderTopWidth: 1, borderColor: c.border, backgroundColor: `${c.accent}14` }}>
                <Text variant="callout" color={c.accentGlow} style={{ width: 52 }}>{`#${view.me.place.toLocaleString()}`}</Text>
                <Text variant="callout" style={{ flex: 1 }}>You</Text>
                <Text variant="callout" color={c.accentGlow}>{fmt(view.me.score)}</Text>
              </View>
            ) : q.data?.meIneligible && board !== 'improved' ? (
              <View style={{ padding: spacing[4], borderTopWidth: 1, borderColor: c.border }}>
                <Text variant="caption" muted>{q.data.meIneligible}</Text>
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Icon name="shield-checkmark" size={18} color={c.success} />
          <Text variant="heading">Fair by design</Text>
        </View>
        <Text variant="caption" dim>
          Boards reward consistency and effort, not genetics. XP is capped daily, suspicious spikes are reviewed, and the top 10 are
          checked before results are final. Weight is never ranked. Cosmetic rewards only.
        </Text>
      </Card>
    </>
  );
}

/** Loading placeholders shaped like the real content (no layout jump when it arrives). */
function PostSkeleton() {
  const { c, radius, spacing } = useTheme();
  const bar = (w: number | `${number}%`, h = 12) => <View style={{ width: w, height: h, borderRadius: 6, backgroundColor: c.surfaceRaised }} />;
  return (
    <View accessibilityLabel="Loading post" style={{ padding: spacing[4], gap: spacing[3], borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, opacity: 0.7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceRaised }} />
        <View style={{ gap: 6 }}>{bar(110)}{bar(70, 10)}</View>
      </View>
      {bar('90%')}{bar('60%')}
    </View>
  );
}

function BoardSkeleton() {
  const { c, radius, spacing } = useTheme();
  return (
    <View accessibilityLabel="Loading board" style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, opacity: 0.7 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
          <View style={{ width: 20, height: 12, borderRadius: 6, backgroundColor: c.surfaceRaised }} />
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.surfaceRaised }} />
          <View style={{ flex: 1, height: 12, borderRadius: 6, backgroundColor: c.surfaceRaised }} />
          <View style={{ width: 40, height: 12, borderRadius: 6, backgroundColor: c.surfaceRaised }} />
        </View>
      ))}
    </View>
  );
}

const MEDAL = { 1: '#F5C451', 2: '#C0C7D1', 3: '#D9925B' } as const;

/** Top 3 on steps: 2nd, 1st, 3rd, with medal colours; the winner gets a trophy and a bigger avatar. */
function Podium({ rows, fmt, onOpen }: {
  rows: { place: number; handle: string; color: string; rank: Rank; score: number }[];
  fmt: (v: number) => string;
  onOpen?: (handle: string) => void;
}) {
  const { spacing } = useTheme();
  const order = [rows[1]!, rows[0]!, rows[2]!];
  return (
    <Card tint="#F5C451">
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingTop: spacing[2] }}>
        {order.map((r, i) => {
          const step = (i === 1 ? 1 : i === 0 ? 2 : 3) as 1 | 2 | 3;
          const color = MEDAL[step];
          return (
            <PressableScale key={r.handle} haptic="tap" disabled={!onOpen} onPress={() => onOpen?.(r.handle)}
              accessibilityRole="button" accessibilityLabel={`Place ${r.place}: @${r.handle}, ${fmt(r.score)}`}
              style={{ alignItems: 'center', gap: spacing[1], width: '31%' }}>
              {step === 1 ? <Icon name="trophy" size={20} color={color} /> : null}
              <Avatar handle={r.handle} color={r.color} rank={r.rank} size={step === 1 ? 60 : 48} />
              <Text variant="callout" numberOfLines={1}>{`@${r.handle}`}</Text>
              <Text variant="heading" color={color} style={{ fontFamily: 'Rajdhani_700Bold', fontSize: 18 }}>{fmt(r.score)}</Text>
              <View style={{ width: '100%', height: step === 1 ? 54 : step === 2 ? 38 : 28, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: `${color}2E`, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="headline" color={color}>{r.place}</Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </Card>
  );
}
