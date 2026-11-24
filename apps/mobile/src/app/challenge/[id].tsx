import { CHALLENGE_XP, gameDate, type ChallengeDayState } from '@lb/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';
import { ChallengeCard, useChallenge, useChallengeActions, useChallengeProgress } from '@/features/challenges';
import { useTrainingProfile } from '@/features/training';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, Pill, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';

const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** One challenge: progress, today's check-list, the full calendar, and ending it. */
export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ch = useChallenge(id);
  const profile = useTrainingProfile();
  const today = gameDate(new Date(), profile.timezone || 'UTC');
  const { end } = useChallengeActions();

  if (!ch) {
    return (
      <Page header={<ScreenHeader title="Challenge" />}>
        <Text dim>This challenge isn’t on this phone.</Text>
      </Page>
    );
  }
  return <Detail ch={ch} today={today} onEnd={() => end(ch)} />;
}

function Detail({ ch, today, onEnd }: { ch: NonNullable<ReturnType<typeof useChallenge>>; today: string; onEnd: () => void }) {
  const { c, spacing, radius } = useTheme();
  const p = useChallengeProgress(ch, today);
  const COLOR: Record<ChallengeDayState, string> = {
    done: c.success, grace: c.mana, missed: c.danger, today: c.accent, partial: c.warning, future: c.surfaceRaised,
  };
  const active = ch.status === 'ACTIVE';

  return (
    <Page
      header={
        <ScreenHeader title={ch.name}
          right={active ? (
            <PressableScale haptic="tap" accessibilityRole="button" accessibilityLabel="End challenge"
              onPress={() => Alert.alert('End this challenge?', 'It stays in your list as ended. XP you earned is kept.', [
                { text: 'Keep going', style: 'cancel' },
                { text: 'End it', style: 'destructive', onPress: () => { onEnd(); router.back(); } },
              ])}>
              <Icon name="stop-circle-outline" size={22} color={c.textMuted} />
            </PressableScale>
          ) : undefined} />
      }>
      {ch.status === 'COMPLETED' ? (
        <Card tint={c.success}>
          <Pill icon="trophy-outline" label={p.flawless ? 'Cleared · flawless' : 'Cleared'} color={c.success} />
          <Text variant="headline">{`${ch.days} days done.`}</Text>
          <Text variant="callout" dim>{p.flawless ? 'Not a single day missed.' : `${p.graceUsed} grace day${p.graceUsed === 1 ? '' : 's'} used, and you finished anyway.`}</Text>
        </Card>
      ) : ch.status === 'ENDED' ? (
        <Card><Text variant="callout" dim>{`Ended after ${p.completedDays} done day${p.completedDays === 1 ? '' : 's'}.`}</Text></Card>
      ) : (
        <ChallengeCard c={ch} today={today} />
      )}

      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <Stat label="Done" value={`${p.completedDays}`} />
        <Stat label="Grace left" value={`${p.graceLeft}/${ch.graceDays}`} />
        <Stat label="Missed" value={`${Math.max(0, p.misses - p.graceUsed)}`} />
      </View>
      {active && p.projectedEnd ? (
        <Text variant="caption" muted>{`Finish on ${fmt(p.projectedEnd)} if you keep every day from here. Started ${fmt(ch.startDate)}.`}</Text>
      ) : null}

      <SectionHeader title="Calendar" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {p.calendar.map((d) => (
          <View key={d.date} accessibilityLabel={`Day ${d.n}, ${fmt(d.date)}: ${d.state}`}
            style={{ width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
              backgroundColor: d.state === 'future' ? COLOR.future : `${COLOR[d.state]}33`, borderWidth: d.date === today ? 1.5 : 0, borderColor: c.accent }}>
            <Text variant="micro" color={d.state === 'future' ? c.textMuted : c.text}>{d.n}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        {([['done', 'Done'], ['grace', 'Grace'], ['missed', 'Missed'], ['partial', 'Started']] as const).map(([k, l]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: COLOR[k] }} />
            <Text variant="caption" muted>{l}</Text>
          </View>
        ))}
      </View>

      <Text variant="caption" muted>
        {`+${CHALLENGE_XP.day} XP for every fully done day, +${CHALLENGE_XP.finish(ch.days)} XP for finishing, +${CHALLENGE_XP.flawlessBonus} more if you never miss.`}
      </Text>
      {active ? <Button variant="ghost" size="md" icon="stop-circle-outline" label="End challenge"
        onPress={() => Alert.alert('End this challenge?', 'It stays in your list as ended. XP you earned is kept.', [
          { text: 'Keep going', style: 'cancel' },
          { text: 'End it', style: 'destructive', onPress: () => { onEnd(); router.back(); } },
        ])} /> : null}
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { c, spacing, radius } = useTheme();
  return (
    <View style={{ flex: 1, padding: spacing[3], gap: 2, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <Text variant="headline">{value}</Text>
      <Text variant="caption" muted>{label}</Text>
    </View>
  );
}
