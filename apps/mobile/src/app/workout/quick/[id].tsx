import { buildQuickSession } from '@lb/engine';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { FollowAlongPlayer, type FollowResult } from '@/features/follow';
import { newId } from '@/lib/id';
import { quickSessions, toFinishInput, useFinishWorkout, type ActiveSession, type FinishSummary } from '@/features/training';
import { useTheme } from '@/theme';
import { Button, CountUp, Icon, Page, ScreenHeader, Text } from '@/ui';

/** On-demand interval sessions (PLAN.md §5.8) run in the follow-along player. XP counts real active time only. */
export default function QuickSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = quickSessions.find((x) => x.id === id);
  const { c, spacing } = useTheme();
  const finish = useFinishWorkout();
  const [result, setResult] = useState<FinishSummary | null>(null);
  const startedAt = useRef(new Date().toISOString());
  const steps = useMemo(() => (q ? buildQuickSession(q) : []), [q]);

  if (!q) return <Redirect href="/train" />;

  const save = (r: FollowResult) => {
    if (r.workSeconds < 30) return router.replace('/train');
    const session: ActiveSession = {
      id: newId(), kind: 'quick', programId: null, dayId: q.id, name: q.name, startedAt: startedAt.current,
      exercises: [], logs: {}, current: 0, restUntil: null, restTotal: 0, coachNote: null,
    };
    const minutes = Math.round((r.workSeconds / 60) * 10) / 10;
    finish.mutate({ session, input: toFinishInput(session, q.rpe, [{ minutes, rpe: q.rpe }]) }, { onSuccess: setResult });
  };

  if (result || finish.isPending) {
    return (
      <Page header={<ScreenHeader title={q.name} icon="close" onBack={() => router.replace('/train')} />}
        footer={<Button label="Done" loading={finish.isPending} onPress={() => router.replace('/train')} />}>
        <View style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[6] }}>
          <Icon name="checkmark-circle" size={48} color={c.success} />
          <Text variant="headline">Session complete</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="title" color={c.accentGlow}>+</Text>
            <CountUp variant="stat" value={result?.xp ?? 0} color={c.accentGlow} style={{ fontSize: 48, lineHeight: 52 }} />
            <Text variant="headline" color={c.accentGlow}>XP</Text>
          </View>
          <Text variant="callout" dim>{(result?.xp ?? 1) > 0 ? 'XP counts real active time only.' : 'Too short to earn XP. Every minute counts next time.'}</Text>
        </View>
      </Page>
    );
  }

  return (
    <FollowAlongPlayer
      title={q.name}
      intro={`${q.summary} ${q.rounds} round${q.rounds > 1 ? 's' : ''} · ${q.work}s on / ${q.rest}s off.`}
      steps={steps}
      accent={c.danger}
      doneLabel="Save session"
      onDone={save}
      onExit={save}
    />
  );
}
