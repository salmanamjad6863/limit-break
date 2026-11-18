import { View } from 'react-native';
import { useGenerateDebrief, useWeeklyDebrief } from '@/features/depth';
import { useTheme } from '@/theme';
import { Button, Card, Page, ScreenHeader, SystemWindow, Text } from '@/ui';

/** Private AI / template weekly debrief (SYSTEMS.md §6.5). Never public. */
export default function WeeklyDebriefScreen() {
  const { c, spacing } = useTheme();
  const { data, isLoading, isError, error, refetch, isFetching } = useWeeklyDebrief();
  const gen = useGenerateDebrief();

  return (
    <Page header={<ScreenHeader title="Weekly debrief" />}>
      <Text variant="callout" dim>A private read on your last completed week. Nutrition adherence stays here — never on ranks or the feed.</Text>

      {isLoading || gen.isPending ? <Text dim>The System is writing…</Text> : null}
      {isError ? (
        <Card>
          <Text variant="callout" color={c.warning}>{error instanceof Error ? error.message : 'Couldn’t load the debrief.'}</Text>
          <Button size="md" variant="secondary" label="Try again" onPress={() => void refetch()} />
        </Card>
      ) : null}

      {data ? (
        <SystemWindow title="Weekly debrief" accent={c.mana} typeDelayMs={200}>
          <Text variant="callout">{data.body}</Text>
          <View style={{ gap: spacing[1], marginTop: spacing[2] }}>
            <Meta k="Week" v={`${data.metrics.weekStart} → ${data.metrics.weekEnd}`} />
            <Meta k="Workouts" v={String(data.metrics.workouts)} />
            <Meta k="XP" v={data.metrics.xp.toLocaleString()} />
            <Meta k="Quest days" v={String(data.metrics.questDays)} />
            <Meta k="PRs" v={String(data.metrics.prs)} />
            <Meta k="Streak" v={String(data.metrics.streak)} />
            <Meta k="Food days logged" v={String(data.metrics.nutritionDaysLogged)} />
            {data.metrics.nutritionAdherencePct != null ? (
              <Meta k="Target adherence" v={`${data.metrics.nutritionAdherencePct}%`} />
            ) : null}
          </View>
        </SystemWindow>
      ) : !isLoading && !isError ? (
        <Card>
          <Text variant="headline">No debrief yet</Text>
          <Text variant="callout" dim>Finish a Monday–Sunday week of hunting, then generate your read.</Text>
          <Button size="md" icon="sparkles" label="Generate debrief" loading={gen.isPending || isFetching} onPress={() => gen.mutate()} />
        </Card>
      ) : null}

      {data ? (
        <Button variant="ghost" size="md" label="Refresh" loading={isFetching || gen.isPending} onPress={() => { gen.mutate(); }} />
      ) : null}
    </Page>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <Text variant="caption" muted>{k}</Text>
      <Text variant="caption" style={{ flexShrink: 1, textAlign: 'right' }}>{v}</Text>
    </View>
  );
}
