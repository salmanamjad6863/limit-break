import { staleSession } from '@lb/engine';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Text } from '@/ui';
import { lastActivityAt, useWorkoutSession, type ActiveSession } from './session';

/** Stale check for the live session (docs/plans/TRAIN_REDESIGN.md §3.3): untouched for 6 h or more. */
export function useStaleSession() {
  const active = useWorkoutSession((s) => s.active);
  if (!active) return null;
  const info = staleSession(active.startedAt, lastActivityAt(active));
  return info.stale ? { active, ...info } : null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * "Finish or discard?" for an abandoned session, instead of a 1121-minute timer. Saving finishes it as of
 * the last logged set, so the game day, duration and XP stay honest.
 */
export function StaleSessionCard({ a, finishAt, canSave }: { a: ActiveSession; finishAt: string; canSave: boolean }) {
  const { c, spacing } = useTheme();
  const finish = useWorkoutSession((s) => s.finishAt);
  const end = useWorkoutSession((s) => s.end);
  const sets = Object.values(a.logs).reduce((n, l) => n + l.filter((x) => !x.isWarmup).length, 0);
  return (
    <Card tint={c.warning}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Icon name="hourglass-outline" size={18} color={c.warning} />
        <Text variant="label" color={c.warning}>Unfinished workout</Text>
      </View>
      <Text variant="headline">{a.name}</Text>
      <Text variant="callout" dim>
        {`Started ${when(a.startedAt)}. ${sets ? `${sets} working ${sets === 1 ? 'set' : 'sets'} logged.` : 'No sets logged.'} ${
          canSave ? 'Save it as of your last set, or discard it.' : sets ? 'It’s too old to save now, so it can only be discarded.' : 'There’s nothing to save.'}`}
      </Text>
      {canSave ? (
        <Button label="Save what I did" icon="flag" onPress={() => { finish(finishAt); router.push('/workout/debrief'); }} />
      ) : null}
      <Button variant={canSave ? 'secondary' : 'primary'} icon="trash-outline" label="Discard workout"
        onPress={() => { end(); router.dismissTo('/train'); }} />
    </Card>
  );
}
