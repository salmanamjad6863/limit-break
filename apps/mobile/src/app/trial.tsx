import { trials, type TrialEventDef } from '@lb/content';
import type { FitnessTests, TrialAttemptResponse } from '@lb/contracts';
import { KEY_LIFTS, RANKS } from '@lb/engine';
import { rankColor } from '@lb/tokens';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useAttemptTrial, useMe, useProgression } from '@/features/progression';
import { exerciseName, useTraining, useTrainingProfile } from '@/features/training';
import { useTheme } from '@/theme';
import { Appear, Bar, Button, Card, Icon, Page, Pill, ScreenHeader, Text } from '@/ui';
import { Segmented, Stepper, TestTimer } from '@/ui/form';
import { RankBadge } from '@/ui/fx';

type Step = { kind: 'intro' } | { kind: 'event'; index: number } | { kind: 'review' } | { kind: 'result'; res: TrialAttemptResponse };

/** Rank Trial flow (SYSTEMS.md §4.4): real tests, strict form standards, server-scored. */
export default function RankTrial() {
  const { c, spacing, radius } = useTheme();
  const { data: me } = useMe();
  const { data: prog } = useProgression();
  const profile = useTrainingProfile();
  const bestE1rm = useTraining((s) => s.bestE1rm);
  const attempt = useAttemptTrial();
  const [setting, setSetting] = useState<'HOME' | 'GYM'>(profile.location === 'GYM' ? 'GYM' : 'HOME');
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [results, setResults] = useState<FitnessTests>({});
  const [runMin, setRunMin] = useState(12);
  const [runSec, setRunSec] = useState(30);

  const target = prog?.trial.target ?? null;
  const runRequired = !!prog?.trial.runRequired;
  const bestLift = KEY_LIFTS.map((id) => ({ id, e1rm: bestE1rm[id] ?? 0 })).filter((l) => l.e1rm > 0).sort((a, b) => b.e1rm / profile.weightKg - a.e1rm / profile.weightKg)[0];

  const events = useMemo<TrialEventDef[]>(() => {
    const list = trials.events.filter((e) => e.settings.includes(setting));
    // Gym without logged lifts → fall back to push-ups for strength
    if (setting === 'GYM' && !bestLift) return [trials.events.find((e) => e.id === 'pushups')!, ...list.filter((e) => e.id !== 'lift')];
    return list;
  }, [setting, bestLift]);

  if (!me?.state || !prog) return <Redirect href="/profile" />;
  if (!target || (!prog.trial.eligible && step.kind !== 'result')) return <Redirect href="/profile" />;
  const color = rankColor[target];

  const setVal = (k: keyof FitnessTests, v: number | null) => setResults((r) => ({ ...r, [k]: v }));
  const valueOf = (e: TrialEventDef): number | null | undefined =>
    e.id === 'lift' ? (bestLift ? bestLift.e1rm : null) : (results[e.id as keyof FitnessTests] ?? null);
  const optional = (e: TrialEventDef) => !!e.optionalBelow && RANKS.indexOf(target) < RANKS.indexOf(e.optionalBelow) && !runRequired;

  // ---------- result ----------
  if (step.kind === 'result') {
    const r = step.res;
    return (
      <Page accent={rankColor[r.target]} header={<ScreenHeader title={`${r.target}-Rank Trial`} icon="close" onBack={() => router.replace('/profile')} />}
        footer={<Button label={r.passed ? 'Continue' : 'Back to profile'} onPress={() => router.replace('/profile')} />}>
        <Appear index={0} style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3] }}>
          {r.passed ? <RankBadge rank={r.target} size={120} /> : <Icon name="shield-half-outline" size={64} color={c.textMuted} />}
          <Text variant="title">{r.passed ? `Promoted to ${r.target}-Rank` : 'Not this time'}</Text>
          <Text variant="callout" dim style={{ textAlign: 'center' }}>
            {r.passed ? 'You earned this with a real test. Nobody can take it away.' : `Train and retry on ${new Date(r.retryAt!).toLocaleDateString()}. Every attempt shows you exactly what to work on.`}
          </Text>
        </Appear>
        <Appear index={1}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="heading">Trial score</Text>
              <Text variant="heading" color={r.passed ? c.success : c.warning}>{`${r.composite} / ${r.required.composite} needed`}</Text>
            </View>
            <Bar ratio={r.composite / 100} height={8} color={r.passed ? c.success : c.warning} />
            {r.events.map((e) => {
              const def = trials.events.find((d) => d.id === e.id);
              const ok = e.percentile >= r.required.minEvent;
              return (
                <View key={e.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="callout">{def?.name ?? e.id}</Text>
                    <Text variant="callout" color={ok ? c.text : c.danger}>{`${formatRaw(e.id, e.raw)} · ${Math.round(e.percentile)}th pct`}</Text>
                  </View>
                  <Bar ratio={e.percentile / 100} height={4} color={ok ? c.accent : c.danger} />
                </View>
              );
            })}
            <Text variant="caption" muted>{`Every event must be at least the ${r.required.minEvent}th percentile. Scores are against adults of your sex.`}</Text>
          </Card>
        </Appear>
      </Page>
    );
  }

  // ---------- intro ----------
  if (step.kind === 'intro') {
    return (
      <Page accent={color} header={<ScreenHeader title={`${target}-Rank Trial`} icon="close" />}
        footer={<Button label="Begin trial" icon="shield-checkmark" onPress={() => setStep({ kind: 'event', index: 0 })} />}>
        <Appear index={0} style={{ alignItems: 'center', gap: spacing[2] }}>
          <RankBadge rank={target} size={110} />
          <Text variant="title">{`Earn ${target}-Rank`}</Text>
          <Text variant="callout" dim style={{ textAlign: 'center' }}>Rank is proof of real fitness. Do each test honestly with strict form; the score is only meaningful if it's real.</Text>
        </Appear>
        <Appear index={1}>
          <Segmented options={[{ value: 'HOME', label: 'Home version' }, { value: 'GYM', label: 'Gym version' }]} value={setting} onChange={(v) => setSetting(v)} />
        </Appear>
        <Appear index={2}>
          <Card>
            {events.map((e, i) => (
              <View key={e.id} style={{ flexDirection: 'row', gap: spacing[3] }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}26` }}>
                  <Text variant="micro" color={color}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="callout">{`${e.name}${optional(e) ? ' (optional)' : ''}`}</Text>
                  <Text variant="caption" muted>{e.id === 'lift' && bestLift ? `Your best: ${exerciseName(bestLift.id)} e1RM ${Math.round(bestLift.e1rm)} kg` : e.how}</Text>
                </View>
              </View>
            ))}
            <Text variant="caption" muted>{`Rest about ${Math.round(trials.restBetweenEventsSec / 60)} minutes between events. Warm up first.`}</Text>
          </Card>
        </Appear>
      </Page>
    );
  }

  // ---------- review ----------
  if (step.kind === 'review') {
    const missing = events.filter((e) => !optional(e) && valueOf(e) == null);
    return (
      <Page accent={color} header={<ScreenHeader title="Review" onBack={() => setStep({ kind: 'event', index: events.length - 1 })} />}
        footer={
          <>
            {attempt.error ? <Text variant="caption" color={c.danger}>Couldn't submit. Check your connection.</Text> : null}
            <Button
              label={attempt.isPending ? 'Scoring…' : 'Submit trial'}
              loading={attempt.isPending}
              disabled={missing.length > 0}
              onPress={() => {
                const clean = Object.fromEntries(Object.entries(results).filter(([k]) => events.some((e) => e.id === k)));
                attempt.mutate({ setting, results: clean }, { onSuccess: (res) => setStep({ kind: 'result', res }) });
              }}
            />
          </>
        }>
        <Text variant="title">Your results</Text>
        <Card>
          {events.map((e) => {
            const v = valueOf(e);
            return (
              <View key={e.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="callout" dim>{e.name}</Text>
                <Text variant="callout">{v == null ? (optional(e) ? 'Skipped' : 'Missing') : e.id === 'lift' ? `${(v / profile.weightKg).toFixed(2)}× BW` : formatRaw(e.id, v)}</Text>
              </View>
            );
          })}
        </Card>
        {missing.length ? <Text variant="caption" color={c.warning}>{`Complete: ${missing.map((m) => m.name).join(', ')}`}</Text> : (
          <Text variant="caption" muted>Submitting scores your trial. A failed attempt can be retried after 7 days.</Text>
        )}
      </Page>
    );
  }

  // ---------- event ----------
  const e = events[step.index]!;
  const isLast = step.index === events.length - 1;
  const next = () => setStep(isLast ? { kind: 'review' } : { kind: 'event', index: step.index + 1 });
  const v = valueOf(e);
  return (
    <Page accent={color}
      header={<ScreenHeader title={`Event ${step.index + 1} of ${events.length}`} onBack={() => setStep(step.index === 0 ? { kind: 'intro' } : { kind: 'event', index: step.index - 1 })} />}
      footer={
        <>
          <Button label={isLast ? 'Review results' : 'Next event'} disabled={v == null && !optional(e)} onPress={next} />
          {optional(e) ? <Button variant="ghost" label="Skip (optional)" onPress={() => { setVal(e.id as keyof FitnessTests, null); next(); }} /> : null}
        </>
      }>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {events.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step.index ? color : c.track }} />)}
      </View>
      <View style={{ gap: spacing[1] }}>
        <Pill label={e.stat === 'STR' ? 'Strength' : e.stat === 'END' ? 'Endurance' : 'Agility'} color={color} />
        <Text variant="title">{e.name}</Text>
        <Text variant="callout" dim>{e.how}</Text>
      </View>
      <Card>
        <Text variant="label" dim>Form standards</Text>
        {e.standards.map((s) => (
          <View key={s} style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Icon name="checkmark-circle-outline" size={16} color={color} />
            <Text variant="callout" style={{ flex: 1 }}>{s}</Text>
          </View>
        ))}
      </Card>
      <Card>
        {e.input === 'history' ? (
          bestLift ? (
            <View style={{ gap: 4 }}>
              <Text variant="caption" muted>Best logged lift (last 90 days)</Text>
              <Text variant="headline">{exerciseName(bestLift.id)}</Text>
              <Text variant="stat">{`${(bestLift.e1rm / profile.weightKg).toFixed(2)}× bodyweight`}</Text>
              <Text variant="caption" muted>{`e1RM ${Math.round(bestLift.e1rm)} kg at ${profile.weightKg} kg bodyweight`}</Text>
            </View>
          ) : null
        ) : e.input === 'time' ? (
          <View style={{ gap: spacing[3] }}>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <View style={{ flex: 1 }}><Stepper label="Minutes" value={runMin} min={4} max={40} onChange={(m) => { setRunMin(m); setVal('run2400Sec', m * 60 + runSec); }} /></View>
              <View style={{ flex: 1 }}><Stepper label="Seconds" value={runSec} min={0} max={55} step={5} onChange={(s) => { setRunSec(s); setVal('run2400Sec', runMin * 60 + s); }} /></View>
            </View>
            {results.run2400Sec == null ? <Button variant="secondary" label={`Use ${runMin}:${String(runSec).padStart(2, '0')}`} onPress={() => setVal('run2400Sec', runMin * 60 + runSec)} /> : null}
          </View>
        ) : (
          <View style={{ gap: spacing[3] }}>
            {e.input === 'stopwatch' ? <TestTimer mode="stopwatch" onResult={(sec) => setVal('plankSec', sec)} /> : null}
            {e.input === 'countdown60' ? <TestTimer mode="countdown" /> : null}
            <Stepper
              label={e.input === 'stopwatch' ? 'Seconds held' : 'Clean reps'}
              value={(v as number | null) ?? 0}
              min={0}
              max={e.input === 'stopwatch' ? 600 : 150}
              step={e.input === 'stopwatch' ? 5 : 1}
              onChange={(n) => setVal(e.id as keyof FitnessTests, n)}
            />
          </View>
        )}
      </Card>
      <View style={{ padding: spacing[3], borderRadius: radius.md, backgroundColor: c.surfaceRaised, flexDirection: 'row', gap: spacing[2] }}>
        <Icon name="information-circle-outline" size={16} />
        <Text variant="caption" dim style={{ flex: 1 }}>Top A/S-Rank results will require video or heart-rate verification for leaderboards.</Text>
      </View>
    </Page>
  );
}

function formatRaw(id: string, raw: number): string {
  if (id === 'run2400Sec') return `${Math.floor(raw / 60)}:${String(Math.round(raw % 60)).padStart(2, '0')}`;
  if (id === 'plankSec') return `${raw} s`;
  if (id === 'lift') return `${raw}× BW`;
  return `${raw} reps`;
}
