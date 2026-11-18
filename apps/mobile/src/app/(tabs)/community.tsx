import { useState } from 'react';
import { View } from 'react-native';
import { Avatar } from '@/features/community/Avatar';
import { LiveHall, LiveTopHunters } from '@/features/community/Live';
import { useSession } from '@/features/session';
import { BOARDS, DEMO_LEADERS, DEMO_ME_ON_BOARD, DEMO_POSTS, type BoardId } from '@/features/community/demo';
import { useTheme } from '@/theme';
import { Appear, Bar, Button, Card, Icon, Pill, PressableScale, Screen, SectionHeader, Text } from '@/ui';
import { Segmented } from '@/ui/form';

type View_ = 'hall' | 'top' | 'guild';

export default function CommunityScreen() {
  const [view, setView] = useState<View_>('hall');
  const { spacing } = useTheme();
  // demo builds (no backend) keep the preview; signed-in hunters get the real community
  const live = useSession((s) => s.status === 'signedIn');
  const Hall = live ? LiveHall : DemoHall;
  const TopHunters = live ? LiveTopHunters : DemoTopHunters;
  return (
    <Screen title="Community" subtitle="Hunters worldwide, levelling up together." accent="#F5C451" right={live ? undefined : <Pill icon="sparkles" label="Preview" />}>
      <Appear index={1}>
        <Segmented
          options={[{ value: 'hall', label: 'The Hall' }, { value: 'top', label: 'Top Hunters' }, { value: 'guild', label: 'Guild' }]}
          value={view}
          onChange={(v) => setView(v)}
        />
      </Appear>
      <View key={view} style={{ gap: spacing[5] }}>
        {view === 'hall' ? <Hall /> : view === 'top' ? <TopHunters /> : <Guild />}
      </View>
    </Screen>
  );
}

/* ---------------- The Hall: global feed ---------------- */
function DemoHall() {
  const { c, spacing, radius } = useTheme();
  const [feed, setFeed] = useState<'following' | 'global' | 'rank'>('global');
  const [respected, setRespected] = useState<Record<string, boolean>>({});
  return (
    <>
      <Appear index={2}>
        <PressableScale haptic="tap" accessibilityRole="button" accessibilityLabel="Share your progress"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
          <Avatar handle="you" color={c.accent} size={36} />
          <Text variant="callout" muted style={{ flex: 1 }}>Share your progress…</Text>
          <Icon name="image-outline" size={20} />
          <Icon name="barbell-outline" size={20} />
        </PressableScale>
      </Appear>
      <Appear index={3} style={{ flexDirection: 'row', gap: spacing[2] }}>
        {([['following', 'Following'], ['global', 'Global'], ['rank', 'My rank']] as const).map(([v, l]) => (
          <PressableScale key={v} haptic="tap" onPress={() => setFeed(v)} accessibilityRole="tab" accessibilityState={{ selected: feed === v }}
            style={{ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.pill, backgroundColor: feed === v ? c.surfaceRaised : 'transparent', borderWidth: 1, borderColor: feed === v ? c.borderStrong : 'transparent' }}>
            <Text variant="callout" color={feed === v ? c.text : c.textDim}>{l}</Text>
          </PressableScale>
        ))}
      </Appear>
      {DEMO_POSTS.map((p, i) => {
        const on = !!respected[p.id];
        return (
          <Appear key={p.id} index={4 + i}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                <Avatar handle={p.handle} color={p.color} rank={p.rank} />
                <View style={{ flex: 1 }}>
                  <Text variant="heading">{`@${p.handle}`}</Text>
                  <Text variant="caption" muted>{p.ago}</Text>
                </View>
                <Icon name="ellipsis-horizontal" size={18} color={c.textMuted} />
              </View>
              {p.title ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  <Icon name={p.kind === 'pr' ? 'trophy' : 'ribbon'} size={18} color={p.kind === 'pr' ? '#F5C451' : p.color} />
                  <Text variant="heading">{p.title}</Text>
                </View>
              ) : null}
              <Text variant="body">{p.body}</Text>
              {'workout' in p && p.workout ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing[3], borderRadius: radius.md, backgroundColor: c.surfaceRaised }}>
                  {p.workout.stats.map((s) => (
                    <Text key={s} variant="callout">{s}</Text>
                  ))}
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[5], marginTop: spacing[1] }}>
                <PressableScale haptic="tap" onPress={() => setRespected((r) => ({ ...r, [p.id]: !r[p.id] }))} accessibilityRole="button" accessibilityLabel="Respect"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name={on ? 'flame' : 'flame-outline'} size={19} color={on ? c.warning : c.textDim} />
                  <Text variant="callout" color={on ? c.warning : c.textDim}>{`${p.respect + (on ? 1 : 0)} Respect`}</Text>
                </PressableScale>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="chatbubble-outline" size={18} />
                  <Text variant="callout" dim>{p.comments}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <Icon name="share-outline" size={19} />
              </View>
            </Card>
          </Appear>
        );
      })}
    </>
  );
}

/* ---------------- Top Hunters of the Month ---------------- */
function DemoTopHunters() {
  const { c, spacing, radius } = useTheme();
  const [board, setBoard] = useState<BoardId>('consistent');
  const meta = BOARDS.find((b) => b.id === board)!;
  const rows = DEMO_LEADERS[board];
  const me = DEMO_ME_ON_BOARD[board];
  const month = new Date().toLocaleString('en', { month: 'long' });
  const daysLeft = (() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() - n.getDate();
  })();
  const fmt = (v: number) => `${v % 1 ? v.toFixed(1) : v.toLocaleString()}${meta.unit}`;
  const podium = [rows[1]!, rows[0]!, rows[2]!];
  const medal: Record<1 | 2 | 3, string> = { 1: '#F5C451', 2: '#C0C7D1', 3: '#D9925B' };

  return (
    <>
      <Appear index={2} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text variant="headline">{`Top Hunters · ${month}`}</Text>
          <Text variant="caption" muted>{`${daysLeft} days left · results final on the 3rd`}</Text>
        </View>
        <Pill icon="globe-outline" label="All ranks" />
      </Appear>
      <Appear index={3} style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
        {BOARDS.map((b) => (
          <PressableScale key={b.id} haptic="tap" onPress={() => setBoard(b.id)} accessibilityRole="tab" accessibilityState={{ selected: board === b.id }}
            style={{ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.pill, backgroundColor: board === b.id ? `${c.accent}26` : c.surface, borderWidth: 1, borderColor: board === b.id ? c.accent : c.border }}>
            <Text variant="callout" color={board === b.id ? c.text : c.textDim}>{b.label}</Text>
          </PressableScale>
        ))}
      </Appear>

      <Appear index={4}>
        <Card tint="#F5C451">
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingTop: spacing[2] }}>
            {podium.map((r, i) => {
              const place: 1 | 2 | 3 = i === 1 ? 1 : i === 0 ? 2 : 3;
              return (
                <View key={r.handle} style={{ alignItems: 'center', gap: spacing[1], width: '31%' }}>
                  {place === 1 ? <Icon name="trophy" size={20} color="#F5C451" /> : null}
                  <Avatar handle={r.handle} color={r.color} rank={r.rank} size={place === 1 ? 60 : 48} />
                  <Text variant="callout" numberOfLines={1}>{`@${r.handle}`}</Text>
                  <Text variant="heading" color={medal[place]} style={{ fontFamily: 'Rajdhani_700Bold', fontSize: 18 }}>{fmt(r.score)}</Text>
                  <View style={{ width: '100%', height: place === 1 ? 54 : place === 2 ? 38 : 28, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: `${medal[place]}2E`, alignItems: 'center', justifyContent: 'center' }}>
                    <Text variant="headline" color={medal[place]}>{place}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      </Appear>

      <Appear index={5}>
        <Card padded={false}>
          {rows.slice(3).map((r, i) => (
            <View key={r.handle} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
              <Text variant="callout" muted style={{ width: 24 }}>{i + 4}</Text>
              <Avatar handle={r.handle} color={r.color} rank={r.rank} size={34} />
              <Text variant="callout" style={{ flex: 1 }}>{`@${r.handle}`}</Text>
              <Text variant="callout">{fmt(r.score)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderTopWidth: 1, borderColor: c.border, backgroundColor: `${c.accent}14` }}>
            <Text variant="callout" color={c.accentGlow} style={{ width: 40 }}>{`#${me.place}`}</Text>
            <Avatar handle="you" color={c.accent} size={34} />
            <Text variant="callout" style={{ flex: 1 }}>You</Text>
            <Text variant="callout" color={c.accentGlow}>{fmt(me.score)}</Text>
          </View>
        </Card>
      </Appear>

      <Appear index={6}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Icon name="shield-checkmark" size={18} color={c.success} />
            <Text variant="heading">Fair by design</Text>
          </View>
          <Text variant="caption" dim>
            Boards reward consistency and improvement, not genetics. XP is capped daily, suspicious spikes are reviewed, and
            the top 10 are checked before results are final. Weight is never ranked.
          </Text>
        </Card>
      </Appear>
    </>
  );
}

/* ---------------- Guild ---------------- */
function Guild() {
  const { c, spacing } = useTheme();
  const members = [
    { name: 'Kaze', pct: 1.18, color: '#3DDC97' },
    { name: 'Aiko', pct: 0.96, color: '#38C6F4' },
    { name: 'You', pct: 0.84, color: '#A893FF' },
    { name: 'Gora', pct: 0.41, color: '#FF9F43' },
  ];
  return (
    <>
      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title="Weekly raid" action="Guild chat" />
        <Card tint="#F5C451">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5C45122' }}>
              <Icon name="shield" size={22} color="#F5C451" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="heading">Iron Leviathan</Text>
              <Text variant="caption" dim>37% HP left · 2 days remaining</Text>
            </View>
          </View>
          <Bar ratio={0.37} height={8} color="#F5C451" delayMs={200} />
          {members.map((m, i) => (
            <View key={m.name} style={{ gap: spacing[2] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="callout">{m.name}</Text>
                <Text variant="callout" dim>{`${Math.round(m.pct * 100)}% of own baseline`}</Text>
              </View>
              <Bar ratio={Math.min(1, m.pct / 1.2)} height={5} color={m.color} delayMs={300 + i * 90} />
            </View>
          ))}
        </Card>
      </Appear>
      <Appear index={3}>
        <Button variant="secondary" icon="person-add-outline" label="Invite a friend" />
      </Appear>
      <Appear index={4}>
        <Text variant="caption" muted style={{ textAlign: 'center' }}>Preview: guilds, raids and friend streaks arrive in the next update.</Text>
      </Appear>
    </>
  );
}
