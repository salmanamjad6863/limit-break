import { dataColors } from '@lb/tokens';
import { View } from 'react-native';
import { useQuestDeadline } from '@/lib/time';
import { useTheme } from '@/theme';
import { Appear, Bar, Card, Icon, Pill, Screen, SectionHeader, SystemWindow, Text } from '@/ui';

const SIDE = [
  { label: 'Hit your protein target', icon: 'water' as const, xp: 15, ratio: 0.7, color: dataColors.protein },
  { label: 'Walk 8,000 steps', icon: 'walk' as const, xp: 15, ratio: 0.45, color: '#3DDC97' },
  { label: 'Drink 2 L of water', icon: 'beaker' as const, xp: 15, ratio: 0.9, color: '#7DD8F7' },
];

export default function QuestsScreen() {
  const { c, spacing } = useTheme();
  const deadline = useQuestDeadline();
  return (
    <Screen title="Quests" subtitle="Small daily wins that compound." accent={c.danger}>
      <Appear index={1}>
        <SystemWindow title="Daily Quest" accent={c.danger} right={<Pill icon="time-outline" label={deadline} />}>
          <Text variant="callout" dim>Push-ups 20 · Squats 40 · Plank 60 s. Scaled to your Awakening results.</Text>
        </SystemWindow>
      </Appear>

      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title="Side quests" action="Pick 3" />
        <Card>
          {SIDE.map((q, i) => (
            <View key={q.label} style={{ gap: spacing[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                <Icon name={q.icon} size={18} color={q.color} />
                <Text variant="callout" style={{ flex: 1 }}>{q.label}</Text>
                <Text variant="caption" color={c.accentGlow}>{`+${q.xp} XP`}</Text>
              </View>
              <Bar ratio={q.ratio} height={4} color={q.color} delayMs={200 + i * 100} />
            </View>
          ))}
        </Card>
      </Appear>

      <Appear index={3} style={{ gap: spacing[3] }}>
        <SectionHeader title="Weekly boss" />
        <Card tint="#7C5CFF">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C5CFF22' }}>
              <Icon name="skull" size={22} color="#A893FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="heading">Your Shadow-Self</Text>
              <Text variant="caption" dim>You, four weeks ago. Beat its numbers to win.</Text>
            </View>
          </View>
          <Bar ratio={0.62} height={8} color="#A893FF" delayMs={300} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" muted>Boss HP 62%</Text>
            <Text variant="caption" dim>Resets Monday</Text>
          </View>
        </Card>
      </Appear>
    </Screen>
  );
}
