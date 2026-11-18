/**
 * Live Guild / Friends / League panel for the Community tab (SYSTEMS.md §5.6).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';
import { useSession } from '@/features/session';
import { useTheme } from '@/theme';
import { Appear, Bar, Button, Card, Icon, SectionHeader, Text } from '@/ui';
import { TextField } from '@/ui/form';
import {
  useConversations, useCreateGuild, useDuels, useFriends, useGiftShield, useHunterLicense, useJoinGuild, useLeague,
  useLeaveGuild, useMyGuild, useRaid, useRespondDuel,
} from './api';

export function LiveGuild() {
  const isGuest = useSession((s) => s.isGuest);
  if (isGuest) {
    return (
      <Appear index={2}>
        <Card>
          <Text variant="headline">Guilds & friends</Text>
          <Text variant="callout" dim>Save your account to join a guild, run weekly raids, duel friends and climb leagues.</Text>
          <Button size="md" label="Save your progress" onPress={() => router.push('/sign-in?mode=save')} />
        </Card>
      </Appear>
    );
  }
  return (
    <>
      <QuickLinks />
      <RaidBlock />
      <FriendsBlock />
      <DuelsBlock />
      <LeagueBlock />
      <LicenseBlock />
    </>
  );
}

function QuickLinks() {
  const { spacing } = useTheme();
  const inbox = useConversations();
  const unread = (inbox.data?.conversations ?? []).reduce((n, c) => n + c.unread, 0);
  return (
    <Appear index={1} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
      <Button size="md" variant="secondary" icon="chatbubbles-outline" label={unread ? `Messages (${unread})` : 'Messages'}
        onPress={() => router.push('/social/messages')} />
      <Button size="md" variant="ghost" icon="shield-checkmark-outline" label="Mod queue"
        onPress={() => router.push('/community/moderation')} />
    </Appear>
  );
}

function RaidBlock() {
  const { c, spacing } = useTheme();
  const mine = useMyGuild();
  const guild = mine.data?.guild ?? null;
  const raid = useRaid(guild?.id);
  const create = useCreateGuild();
  const join = useJoinGuild();
  const leave = useLeaveGuild();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  if (mine.isLoading) return <Appear index={2}><Text dim>Loading guild…</Text></Appear>;

  if (!guild) {
    return (
      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title="Your guild" />
        <Card>
          <Text variant="headline">Form or join a party</Text>
          <Text variant="callout" dim>Up to 20 hunters. Public guilds show in the list; private ones need a code.</Text>
          <TextField label="Guild name" value={name} onChangeText={setName} placeholder="Shadow Pavilion" />
          <Button size="md" label="Create guild" loading={create.isPending} disabled={name.trim().length < 3}
            onPress={() => create.mutate({ name: name.trim(), isPublic: true })} />
          <TextField label="Join code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="ABCD12" />
          <Button variant="secondary" size="md" label="Join with code" loading={join.isPending} disabled={code.trim().length < 4}
            onPress={() => join.mutate(code.trim())} />
          {(create.error || join.error) ? <Text variant="caption" color={c.warning}>{String((create.error ?? join.error)?.message)}</Text> : null}
        </Card>
      </Appear>
    );
  }

  const r = raid.data;
  const hpLeft = r ? Math.max(0, 1 - r.damageTotal / Math.max(1, r.bossHp)) : 0;

  return (
    <Appear index={2} style={{ gap: spacing[3] }}>
      <SectionHeader title={guild.name} action={guild.code} />
      <Card tint="#F5C451">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5C45122' }}>
            <Icon name="shield" size={22} color="#F5C451" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading">{r?.cleared ? 'Raid cleared' : 'Weekly raid'}</Text>
            <Text variant="caption" dim>
              {r
                ? `${Math.round(hpLeft * 100)}% HP left · ${guild.memberCount}/20 · code ${guild.code}`
                : 'Opening this week’s raid…'}
            </Text>
          </View>
        </View>
        {r ? (
          <>
            <Bar ratio={1 - hpLeft} height={8} color="#F5C451" delayMs={200} />
            {r.contributions.slice(0, 8).map((m, i) => (
              <View key={m.user.userId} style={{ gap: spacing[2] }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="callout">@{m.user.handle}</Text>
                  <Text variant="callout" dim>{`${Math.round(m.contribution * 100)}% of own baseline`}</Text>
                </View>
                <Bar ratio={Math.min(1, m.contribution / 1.2)} height={5} color={i === 0 ? '#3DDC97' : '#A893FF'} delayMs={300 + i * 60} />
              </View>
            ))}
          </>
        ) : null}
        <Button size="md" icon="chatbubble-outline" label="Guild chat" onPress={() => router.push(`/social/guild/${guild.id}/chat`)} />
        <Button variant="ghost" size="md" label="Leave guild" loading={leave.isPending} onPress={() => leave.mutate(guild.id)} />
      </Card>
    </Appear>
  );
}

function FriendsBlock() {
  const { spacing } = useTheme();
  const friends = useFriends();
  const gift = useGiftShield();
  const list = friends.data?.friends ?? [];
  return (
    <Appear index={3} style={{ gap: spacing[3] }}>
      <SectionHeader title="Friend streaks" />
      {list.length === 0 ? (
        <Card><Text variant="callout" dim>Mutual follows become friends. Complete the Daily Quest together to build a shared streak.</Text></Card>
      ) : list.map((f) => (
        <Card key={f.friend.userId}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text variant="heading">@{f.friend.handle}</Text>
              <Text variant="caption" dim>{`Streak ${f.current} · best ${f.longest}`}</Text>
            </View>
            <Button size="md" variant="secondary" label={f.giftedThisMonth ? 'Gifted' : 'Gift shield'}
              disabled={f.giftedThisMonth || gift.isPending}
              onPress={() => gift.mutate(f.friend.userId)} />
          </View>
        </Card>
      ))}
    </Appear>
  );
}

function DuelsBlock() {
  const { spacing } = useTheme();
  const duels = useDuels();
  const respond = useRespondDuel();
  const list = duels.data?.duels ?? [];
  return (
    <Appear index={4} style={{ gap: spacing[3] }}>
      <SectionHeader title="Duels" />
      {list.length === 0 ? (
        <Card><Text variant="callout" dim>Challenge a friend to a 7-day XP duel. Score is effort vs your own baseline — beginners can win.</Text></Card>
      ) : list.slice(0, 5).map((d) => {
        const peer = d.mine === 'challenger' ? d.opponent : d.challenger;
        const myScore = d.mine === 'challenger' ? d.challengerScore : d.opponentScore;
        const theirScore = d.mine === 'challenger' ? d.opponentScore : d.challengerScore;
        return (
          <Card key={d.id}>
            <Text variant="heading">vs @{peer.handle}</Text>
            <Text variant="caption" dim>{`${d.status} · you ${myScore.toFixed(2)} · them ${theirScore.toFixed(2)}`}</Text>
            {d.status === 'pending' && d.mine === 'opponent' ? (
              <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                <Button size="md" label="Accept" onPress={() => respond.mutate({ id: d.id, accept: true })} />
                <Button size="md" variant="ghost" label="Decline" onPress={() => respond.mutate({ id: d.id, accept: false })} />
              </View>
            ) : null}
          </Card>
        );
      })}
    </Appear>
  );
}

function LeagueBlock() {
  const { spacing } = useTheme();
  const league = useLeague();
  if (league.isError) {
    return (
      <Appear index={5}>
        <Card><Text variant="callout" dim>Leagues need a public profile and age 18+. Make your profile public in community settings.</Text></Card>
      </Appear>
    );
  }
  const L = league.data;
  if (!L) return null;
  return (
    <Appear index={5} style={{ gap: spacing[3] }}>
      <SectionHeader title={`${L.tier} league`} />
      <Card>
        <Text variant="caption" dim>{`Top ${L.promoteThrough} promote · bottom from #${L.demoteFrom} demote · your place ${L.myPlace ?? '—'}`}</Text>
        {L.members.slice(0, 10).map((m) => (
          <View key={m.user.userId} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text variant="callout">{`${m.place ?? '—'}  @${m.user.handle}${m.mine ? ' (you)' : ''}`}</Text>
            <Text variant="callout" dim>{`${m.xp} XP`}</Text>
          </View>
        ))}
      </Card>
    </Appear>
  );
}

function LicenseBlock() {
  const { c, spacing, radius } = useTheme();
  const license = useHunterLicense();
  const L = license.data;
  if (!L) return null;
  return (
    <Appear index={6} style={{ gap: spacing[3] }}>
      <SectionHeader title="Hunter License" />
      <Card tint={c.accent}>
        <Text variant="headline">@{L.handle}</Text>
        <Text variant="caption" color={c.accent}>{`${L.rank}-Rank · Lv ${L.level} · PL ${L.powerLevel}`}</Text>
        <Text variant="caption" dim>{`Streak ${L.streak} · ${L.heroClass ?? 'hunter'}`}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], marginTop: spacing[2] }}>
          {Object.entries(L.stats).map(([k, v]) => (
            <View key={k} style={{ minWidth: 56, padding: spacing[2], borderRadius: radius.md, backgroundColor: c.surface }}>
              <Text variant="caption" muted>{k}</Text>
              <Text variant="stat">{v}</Text>
            </View>
          ))}
        </View>
        <Button size="md" icon="share-outline" label="Share license"
          onPress={() => Share.share({ message: `LIMITBREAK Hunter License\n@${L.handle} · ${L.rank}-Rank · Lv ${L.level} · Power ${L.powerLevel}` })} />
      </Card>
    </Appear>
  );
}
