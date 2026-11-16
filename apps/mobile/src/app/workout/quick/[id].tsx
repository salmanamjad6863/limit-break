import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { haptics } from '@/lib/haptics';
import { newId } from '@/lib/id';
import { exerciseById, quickSessions, toFinishInput, useFinishWorkout, type ActiveSession, type FinishSummary } from '@/features/training';
import { mmss } from '@/features/training/format';
import { useTheme } from '@/theme';
import { Button, Card, CountUp, Icon, Page, Pill, ScreenHeader, Text } from '@/ui';
import { Ring } from '@/ui/fx';

interface Phase { kind: 'work' | 'rest'; moveId: string; seconds: number; round: number }

/** Interval player for on-demand sessions (PLAN.md §5.8). Timestamp-based so it never drifts. */
export default function QuickSessionPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = quickSessions.find((x) => x.id === id);
  const { c, spacing } = useTheme();
  const finish = useFinishWorkout();
  const [result, setResult] = useState<FinishSummary | null>(null);

  const phases = useMemo<Phase[]>(() => {
    if (!q) return [];
    const out: Phase[] = [];
    for (let r = 1; r <= q.rounds; r++)
      q.moves.forEach((m, k) => {
        out.push({ kind: 'work', moveId: m, seconds: q.work, round: r });
        const last = r === q.rounds && k === q.moves.length - 1;
        if (q.rest > 0 && !last) out.push({ kind: 'rest', moveId: q.moves[(k + 1) % q.moves.length]!, seconds: q.rest, round: r });
      });
    return out;
  }, [q]);

  const [index, setIndex] = useState(-1); // -1 = not started
  const [paused, setPaused] = useState(false);
  const [left, setLeft] = useState(0);
  const phaseEnd = useRef(0);
  const startedAt = useRef<string>('');
  const pausedLeft = useRef(0);
  /** seconds actually spent in completed phases (skips and pauses don't count) */
  const spent = useRef(0);
  const phaseStart = useRef(0);

  useEffect(() => {
    if (index < 0 || paused || index >= phases.length) return;
    const t = setInterval(() => {
      const ms = phaseEnd.current - Date.now();
      setLeft(Math.ceil(ms / 1000));
      if (ms <= 0) {
        const next = index + 1;
        spent.current += Math.min(phases[index]!.seconds, Math.max(0, (Date.now() - phaseStart.current) / 1000));
        phaseStart.current = Date.now();
        haptics.press();
        if (next < phases.length) {
          phaseEnd.current = Date.now() + phases[next]!.seconds * 1000;
          setLeft(phases[next]!.seconds);
        }
        setIndex(next);
      }
    }, 200);
    return () => clearInterval(t);
  }, [index, paused, phases]);

  if (!q) return <Redirect href="/train" />;
  const total = phases.reduce((s, p) => s + p.seconds, 0);
  const finishedAll = index >= phases.length;
  const ph = phases[Math.min(Math.max(index, 0), phases.length - 1)]!;
  const move = exerciseById.get(ph.moveId)!;
  const nextWork = phases.slice(index + 1).find((p) => p.kind === 'work');

  const begin = () => {
    startedAt.current = new Date().toISOString();
    phaseEnd.current = Date.now() + phases[0]!.seconds * 1000;
    phaseStart.current = Date.now();
    spent.current = 0;
    setLeft(phases[0]!.seconds);
    setIndex(0);
    haptics.heavy();
  };
  /** Credit only real active time (SYSTEMS.md §4.1: XP per minute of real work). */
  const save = () => {
    const session: ActiveSession = {
      id: newId(), kind: 'quick', programId: null, dayId: q.id, name: q.name, startedAt: startedAt.current || new Date().toISOString(),
      exercises: [], logs: {}, current: 0, restUntil: null, restTotal: 0, coachNote: null,
    };
    const inPhase = index >= 0 && index < phases.length && !paused ? Math.max(0, (Date.now() - phaseStart.current) / 1000) : 0;
    const minutes = Math.round(((spent.current + inPhase) / 60) * 10) / 10;
    finish.mutate({ session, input: toFinishInput(session, q.rpe, [{ minutes, rpe: q.rpe }]) }, { onSuccess: setResult });
  };

  if (result) {
    return (
      <Page header={<ScreenHeader title={q.name} icon="close" onBack={() => router.replace('/train')} />} footer={<Button label="Done" onPress={() => router.replace('/train')} />}>
        <View style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[6] }}>
          <Icon name="checkmark-circle" size={48} color={c.success} />
          <Text variant="headline">Session complete</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="title" color={c.accentGlow}>+</Text>
            <CountUp variant="stat" value={result.xp} color={c.accentGlow} style={{ fontSize: 48, lineHeight: 52 }} />
            <Text variant="headline" color={c.accentGlow}>XP</Text>
          </View>
          <Text variant="callout" dim>{result.xp > 0 ? 'XP counts real active time only.' : 'Too short to earn XP. Every minute counts next time.'}</Text>
        </View>
      </Page>
    );
  }

  return (
    <Page
      scroll={false}
      header={<ScreenHeader title={q.name} icon="close" onBack={() => (index >= 0 && !finishedAll ? save() : router.replace('/train'))} />}
      footer={
        index < 0 ? (
          <Button label="Start" icon="play" onPress={begin} />
        ) : finishedAll ? (
          <Button label={finish.isPending ? 'Saving…' : 'Save session'} loading={finish.isPending} onPress={save} />
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Button
                variant="secondary"
                icon={paused ? 'play' : 'pause'}
                label={paused ? 'Resume' : 'Pause'}
                onPress={() => {
                  if (paused) {
                    phaseEnd.current = Date.now() + pausedLeft.current * 1000;
                    phaseStart.current = Date.now();
                    setPaused(false);
                  } else {
                    pausedLeft.current = Math.max(0, (phaseEnd.current - Date.now()) / 1000);
                    spent.current += Math.max(0, (Date.now() - phaseStart.current) / 1000);
                    setPaused(true);
                  }
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" icon="play-skip-forward" label="Skip" onPress={() => { phaseEnd.current = Date.now(); }} />
            </View>
          </View>
        )
      }>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[5] }}>
        {index < 0 ? (
          <Card style={{ alignSelf: 'stretch' }}>
            <Text variant="headline">{q.name}</Text>
            <Text variant="callout" dim>{q.summary}</Text>
            <Text variant="caption" muted>{`${q.moves.length} moves · ${q.rounds} round${q.rounds > 1 ? 's' : ''} · ${q.work}s on / ${q.rest}s off · ${Math.round(total / 60)} min`}</Text>
            {q.moves.map((m, k) => (
              <Text key={`${m}-${k}`} variant="callout">{`${k + 1}. ${exerciseById.get(m)?.name ?? m}`}</Text>
            ))}
          </Card>
        ) : finishedAll ? (
          <View style={{ alignItems: 'center', gap: spacing[2] }}>
            <Icon name="flame" size={44} color={c.warning} />
            <Text variant="headline">All rounds done</Text>
          </View>
        ) : (
          <>
            <Pill label={ph.kind === 'work' ? `Round ${ph.round} of ${q.rounds}` : 'Rest'} color={ph.kind === 'work' ? c.danger : c.mana} />
            <Ring ratio={left / ph.seconds} size={220} stroke={14} color={ph.kind === 'work' ? c.danger : c.mana}>
              <Text variant="stat" style={{ fontSize: 64, lineHeight: 68 }}>{mmss(left)}</Text>
              <Text variant="caption" muted>{paused ? 'Paused' : ph.kind === 'work' ? 'Work' : 'Get ready'}</Text>
            </Ring>
            <View style={{ alignItems: 'center', gap: spacing[1] }}>
              <Text variant="title" style={{ textAlign: 'center' }}>{ph.kind === 'work' ? move.name : `Next: ${move.name}`}</Text>
              <Text variant="callout" dim style={{ textAlign: 'center' }}>{move.cues[0]}</Text>
            </View>
            {nextWork && ph.kind === 'work' ? <Text variant="caption" muted>{`Up next: ${exerciseById.get(nextWork.moveId)?.name}`}</Text> : null}
          </>
        )}
      </View>
    </Page>
  );
}
