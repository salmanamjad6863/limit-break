import { workoutTypes } from '@lb/content';
import { router } from 'expo-router';
import { View } from 'react-native';
import { starterProgramIds } from '@lb/content';
import { useState } from 'react';
import { useFeature } from '@/features/paywall';
import { rankedPrograms, useTraining, useTrainingProfile } from '@/features/training';
import { useTheme } from '@/theme';
import { Appear, Card, Icon, Page, Pill, PressableScale, ScreenHeader, Text } from '@/ui';

const LEVEL: Record<string, string> = { beginner: 'Beginner', novice: 'Novice', intermediate: 'Intermediate', advanced: 'Advanced', pro: 'Pro' };
const LOC: Record<string, string> = { HOME: 'Home', GYM: 'Gym', HYBRID: 'Hybrid' };

export default function ProgramsScreen() {
  const { c, spacing } = useTheme();
  const profile = useTrainingProfile();
  const active = useTraining((s) => s.activeProgramId);
  const ranked = rankedPrograms(profile);
  const recommended = ranked[0]?.program.id;
  // SYSTEMS.md §7.1: the gate is real but open while PAYWALL_ENABLED=false
  const allPrograms = useFeature('allPrograms').enabled;
  const [lockedTap, setLockedTap] = useState<string | null>(null);

  return (
    <Page header={<ScreenHeader title="Programs" />}>
      <PressableScale haptic="press" accessibilityRole="button" accessibilityLabel="My routines: build your own weekly workouts" onPress={() => router.push('/routines')}>
        <Card tint={c.accent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <Icon name="construct-outline" size={22} color={c.accentGlow} />
            <View style={{ flex: 1 }}>
              <Text variant="headline">Build your own routine</Text>
              <Text variant="callout" dim>Choose every exercise, the sets and reps, and which days you train.</Text>
            </View>
            <Icon name="chevron-forward" size={16} />
          </View>
        </Card>
      </PressableScale>
      <Text variant="callout" dim>
        Best fit first for your setting ({LOC[profile.location]}), level and schedule. Open one to see every day at your level.
      </Text>
      {ranked.map(({ program: p }, i) => {
        const type = workoutTypes.find((t) => t.id === p.typeId);
        const isActive = (active ?? recommended) === p.id;
        const locked = !allPrograms && !starterProgramIds.has(p.id) && !isActive;
        return (
          <Appear key={p.id} index={i}>
            <PressableScale
              haptic="press"
              accessibilityRole="button"
              accessibilityLabel={`${p.name}${locked ? ', Premium' : ''}`}
              onPress={() => {
                if (locked) return setLockedTap(p.id);
                router.push(`/program/${p.id}`);
              }}>
              <Card tint={isActive ? c.accent : undefined} style={isActive ? { borderColor: `${c.accent}80` } : undefined}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' }}>
                  {type ? <Pill icon={type.icon as never} label={type.name} color={type.color} /> : null}
                  {p.id === recommended ? <Pill icon="sparkles" label="Recommended" color={c.accentGlow} /> : null}
                  {isActive ? <Pill icon="checkmark-circle" label="Active" color={c.success} /> : null}
                  {locked ? <Pill icon="lock-closed" label="Premium" color={c.warning} /> : null}
                </View>
                <Text variant="headline">{p.name}</Text>
                <Text variant="callout" dim>{p.summary}</Text>
                <View style={{ flexDirection: 'row', gap: spacing[4], flexWrap: 'wrap' }}>
                  <Meta icon="calendar-outline" text={`${p.daysPerWeek.join('–')} days / week`} />
                  <Meta icon="trending-up-outline" text={p.levels.map((l) => LEVEL[l]).join(', ')} />
                  <Meta icon="location-outline" text={p.locations.map((l) => LOC[l]).join(' · ')} />
                </View>
                <Text variant="caption" muted>{p.days.map((d) => d.name).join('  ·  ')}</Text>
                {lockedTap === p.id ? <Text variant="caption" color={c.warning}>Part of Premium. The free programs above cover every level and setting.</Text> : null}
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
