import { workoutTypes } from '@lb/content';
import { router } from 'expo-router';
import { View } from 'react-native';
import { rankedPrograms, useTraining, useTrainingProfile } from '@/features/training';
import { useTheme } from '@/theme';
import { Appear, Card, Icon, Page, Pill, PressableScale, ScreenHeader, Text } from '@/ui';

const LEVEL: Record<string, string> = { beginner: 'Beginner', novice: 'Novice', intermediate: 'Intermediate', advanced: 'Advanced' };
const LOC: Record<string, string> = { HOME: 'Home', GYM: 'Gym', HYBRID: 'Hybrid' };

export default function ProgramsScreen() {
  const { c, spacing } = useTheme();
  const profile = useTrainingProfile();
  const active = useTraining((s) => s.activeProgramId);
  const setProgram = useTraining((s) => s.setProgram);
  const ranked = rankedPrograms(profile);
  const recommended = ranked[0]?.program.id;

  return (
    <Page header={<ScreenHeader title="Choose a program" icon="close" />}>
      <Text variant="callout" dim>
        Programs that fit your setting ({LOC[profile.location]}), level and schedule. Switching starts the new program from its first day.
      </Text>
      {ranked.map(({ program: p }, i) => {
        const type = workoutTypes.find((t) => t.id === p.typeId);
        const isActive = (active ?? recommended) === p.id;
        return (
          <Appear key={p.id} index={i}>
            <PressableScale
              haptic="press"
              accessibilityRole="button"
              accessibilityLabel={`Choose ${p.name}`}
              onPress={() => {
                setProgram(p.id);
                router.back();
              }}>
              <Card tint={isActive ? c.accent : undefined} style={isActive ? { borderColor: `${c.accent}80` } : undefined}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' }}>
                  {type ? <Pill icon={type.icon as never} label={type.name} color={type.color} /> : null}
                  {p.id === recommended ? <Pill icon="sparkles" label="Recommended" color={c.accentGlow} /> : null}
                  {isActive ? <Pill icon="checkmark-circle" label="Active" color={c.success} /> : null}
                </View>
                <Text variant="headline">{p.name}</Text>
                <Text variant="callout" dim>{p.summary}</Text>
                <View style={{ flexDirection: 'row', gap: spacing[4], flexWrap: 'wrap' }}>
                  <Meta icon="calendar-outline" text={`${p.daysPerWeek.join('–')} days / week`} />
                  <Meta icon="trending-up-outline" text={p.levels.map((l) => LEVEL[l]).join(', ')} />
                  <Meta icon="location-outline" text={p.locations.map((l) => LOC[l]).join(' · ')} />
                </View>
                <Text variant="caption" muted>{p.days.map((d) => d.name).join('  ·  ')}</Text>
              </Card>
            </PressableScale>
          </Appear>
        );
      })}
    </Page>
  );
}

function Meta({ icon, text }: { icon: React.ComponentProps<typeof Icon>['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={14} />
      <Text variant="caption" dim>{text}</Text>
    </View>
  );
}
