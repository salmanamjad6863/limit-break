import { exerciseById } from '@lb/content';
import { flowSeconds, type FollowStep } from '@lb/engine';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { AuraLayer, ExerciseMedia, type AuraState } from '@/features/visuals';
import { haptics } from '@/lib/haptics';
import { say, silence, useVoicePref } from '@/lib/voice';
import { mmss } from '@/features/training/format';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, Pill, PressableScale, ScreenHeader, Text } from '@/ui';
import { Ring } from '@/ui/fx';

export interface FollowResult {
  /** real active seconds in work steps (pauses/skips excluded) */
  workSeconds: number;
  completed: boolean;
  /** quest slot index → value reached (reps counted or seconds held) */
  slots: Record<number, number>;
}

const name = (id: string) => exerciseById.get(id)?.name ?? id;

/**
 * The follow-along player (VISUALS.md §4): trainer media, timer ring, voice cues with captions,
 * haptics, auto-advance, pause/skip/+15 s. Timestamp-based, so it never drifts.
 */
export function FollowAlongPlayer({
  title,
  steps,
  accent,
  intro,
  onDone,
  onExit,
  doneLabel = 'Finish',
}: {
  title: string;
  steps: readonly FollowStep[];
  accent: string;
  intro?: string;
  onDone: (r: FollowResult) => void;
  onExit: (r: FollowResult) => void;
  doneLabel?: string;
}) {
  useScreenAwake();
  const { c, spacing, radius } = useTheme();
  const voiceOn = useVoicePref((s) => s.voice);
  const toggleVoice = useVoicePref((s) => s.toggle);
  const [index, setIndex] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [reps, setReps] = useState(0);
  const [caption, setCaption] = useState('');
  const [burst, setBurst] = useState(false);
  const stepStart = useRef(0);
  const stepEnd = useRef(0);
  const pausedLeft = useRef(0);
  const work = useRef(0);
  const slots = useRef<Record<number, number>>({});
  const spoken = useRef<Set<string>>(new Set());
  const total = useMemo(() => flowSeconds(steps), [steps]);
  const finished = index >= steps.length;
  const step = steps[Math.max(0, Math.min(index, steps.length - 1))]!;

  const speak = (key: string, text: string) => {
    if (spoken.current.has(key)) return;
    spoken.current.add(key);
    setCaption(text);
    say(text);
  };

  const result = (completed: boolean): FollowResult => {
    const live = index >= 0 && index < steps.length && steps[index]!.kind === 'work' && !paused ? (Date.now() - stepStart.current) / 1000 : 0;
    return { workSeconds: Math.round(work.current + live), completed, slots: { ...slots.current } };
  };

  /** Enter step k: set its clock and announce it. */
  const enter = (k: number) => {
    if (k >= steps.length) {
      setIndex(k);
      speak('done', 'Done. Great work, Hunter.');
      haptics.success();
      return;
    }
    const s = steps[k]!;
    stepStart.current = Date.now();
    stepEnd.current = s.seconds ? Date.now() + s.seconds * 1000 : 0;
    setReps(0);
    setIndex(k);
    haptics.press();
    const n = name(s.exerciseId);
    if (s.kind === 'ready') speak(`${k}`, `Get ready. ${n}.`);
    else if (s.kind === 'rest') speak(`${k}`, s.side === 'right' ? 'Switch sides.' : `Rest. Next up, ${n}.`);
    else {
      speak(`${k}`, s.targetReps ? `${n}. ${s.targetReps} reps. Go.` : `${n}. Go.`);
      const cue = exerciseById.get(s.exerciseId)?.cues[0];
      if (cue) setTimeout(() => speak(`${k}-cue`, cue), 1600);
    }
  };

  /** Leave step k, crediting real work time and quest progress. */
  const leave = (k: number, repsDone = reps) => {
    const s = steps[k];
    if (!s) return;
    if (s.kind === 'work') {
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
      const spent = Math.min(s.seconds ?? Infinity, (Date.now() - stepStart.current) / 1000);
      work.current += spent;
      if (s.slotIndex != null) slots.current[s.slotIndex] = (slots.current[s.slotIndex] ?? 0) + (s.targetReps ? repsDone : Math.round(spent));
    }
  };

  const next = (repsDone?: number) => {
    leave(index, repsDone);
    enter(index + 1);
  };

  // clock
  useEffect(() => {
    if (index < 0 || finished || paused) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [index, finished, paused]);

  // timed transitions + countdown cues
  useEffect(() => {
    if (index < 0 || finished || paused || !step.seconds) return;
    const left = (stepEnd.current - now) / 1000;
    if (step.kind === 'work' && step.seconds >= 20 && left <= step.seconds / 2 && left > step.seconds / 2 - 1) speak(`${index}-half`, 'Halfway.');
    if (left <= 3.2 && left > 2.8 && step.kind !== 'ready') speak(`${index}-321`, step.kind === 'work' ? 'Three, two, one.' : 'Get ready.');
    if (left <= 0) next();
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  // rep targets auto-advance shortly after being reached
  useEffect(() => {
    if (step.kind === 'work' && step.targetReps && reps >= step.targetReps && !finished) {
      speak(`${index}-hit`, 'Target reached.');
      const id = setTimeout(() => next(reps), 900);
      return () => clearTimeout(id);
    }
  }, [reps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => silence(), []);

  const header = (
    <ScreenHeader
      title={title}
      icon="close"
      onBack={() => {
        silence();
        onExit(result(false));
      }}
      right={
        <PressableScale haptic="tap" onPress={toggleVoice} accessibilityRole="switch" accessibilityState={{ checked: voiceOn }} accessibilityLabel="Voice coach"
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised }}>
          <Icon name={voiceOn ? 'volume-high' : 'volume-mute'} size={18} color={voiceOn ? c.text : c.textMuted} />
        </PressableScale>
      }
    />
  );

  // ---------- intro ----------
  if (index < 0) {
    const moves = steps.filter((s) => s.kind === 'work');
    return (
      <Page accent={accent} header={header} footer={<Button label="Start" icon="play" onPress={() => enter(0)} />}>
        <ExerciseMedia exerciseId={steps[0]!.exerciseId} variant="hero" aura="idle" />
        <Card>
          <Text variant="headline">{title}</Text>
          {intro ? <Text variant="callout" dim>{intro}</Text> : null}
          <Text variant="caption" muted>{`${moves.length} moves · about ${Math.max(1, Math.round(total / 60))} min · voice ${voiceOn ? 'on' : 'off'}, captions on`}</Text>
          {moves.map((s, k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <ExerciseMedia exerciseId={s.exerciseId} variant="thumb" height={40} />
              <Text variant="callout" style={{ flex: 1 }}>{`${name(s.exerciseId)}${s.side ? ` · ${s.side}` : ''}`}</Text>
              <Text variant="caption" muted>{s.targetReps ? `${s.targetReps} reps` : `${s.seconds}s`}</Text>
            </View>
          ))}
        </Card>
      </Page>
    );
  }

  // ---------- done ----------
  if (finished) {
    return (
      <Page accent={accent} header={header} footer={<Button label={doneLabel} icon="checkmark" onPress={() => onDone(result(true))} />}>
        <View style={{ alignItems: 'center', gap: spacing[3], paddingVertical: spacing[8] }}>
          <View style={{ width: 180, height: 180, alignItems: 'center', justifyContent: 'center' }}>
            <AuraLayer state="awakening" />
            <Icon name="checkmark-circle" size={64} color={c.success} />
          </View>
          <Text variant="title">Complete</Text>
          <Text variant="callout" dim>{`${mmss(result(true).workSeconds)} of real work`}</Text>
        </View>
      </Page>
    );
  }

  // ---------- running ----------
  const left = step.seconds ? Math.max(0, Math.ceil(((paused ? Date.now() + pausedLeft.current * 1000 : stepEnd.current) - (paused ? Date.now() : now)) / 1000)) : 0;
  const elapsed = Math.floor((now - stepStart.current) / 1000);
  const color = step.kind === 'work' ? accent : c.mana;
  const upcoming = steps.slice(index + 1).find((s) => s.kind === 'work');
  const remaining = flowSeconds(steps.slice(index + 1)) + (step.seconds ? left : 0);
  const workIdx = steps.slice(0, index + 1).filter((s) => s.kind === 'work').length;
  const workTotal = steps.filter((s) => s.kind === 'work').length;
  // VISUALS.md §3.4: the aura follows effort
  const aura: AuraState = burst
    ? 'burst'
    : step.kind === 'ready' ? 'charging'
    : step.kind === 'rest' ? 'embers'
    : paused ? 'idle'
    : step.targetReps ? (reps >= step.targetReps - 2 ? 'surge' : 'power')
    : left <= 3 ? 'surge' : 'power';

  return (
    <Page accent={color} header={header} scroll={false}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" size="md" icon={paused ? 'play' : 'pause'} label={paused ? 'Resume' : 'Pause'}
              onPress={() => {
                if (paused) {
                  stepStart.current = Date.now() - elapsed * 1000;
                  if (step.seconds) stepEnd.current = Date.now() + pausedLeft.current * 1000;
                  setPaused(false);
                } else {
                  pausedLeft.current = Math.max(0, (stepEnd.current - Date.now()) / 1000);
                  silence();
                  setPaused(true);
                }
              }} />
          </View>
          {step.kind === 'rest' && step.seconds ? (
            <View style={{ flex: 1 }}><Button variant="secondary" size="md" label="+15s" onPress={() => { stepEnd.current += 15_000; }} /></View>
          ) : null}
          <View style={{ flex: 1 }}><Button variant="secondary" size="md" icon="play-skip-forward" label="Skip" onPress={() => next()} /></View>
        </View>
      }>
      <View style={{ flex: 1, gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pill label={step.kind === 'work' ? (step.round ? `Round ${step.round} of ${step.rounds}` : `Move ${workIdx} of ${workTotal}`) : step.kind === 'ready' ? 'Get ready' : 'Rest'} color={color} />
          <Text variant="caption" muted>{`${mmss(remaining)} left`}</Text>
        </View>
        <ExerciseMedia exerciseId={step.exerciseId} variant="hero" height={230} mirrored={step.side === 'right'} aura={aura} playing={!paused} />
        <View style={{ alignItems: 'center', gap: spacing[2] }}>
          <Text variant="headline" style={{ textAlign: 'center' }}>
            {`${step.kind === 'work' ? '' : 'Next: '}${name(step.exerciseId)}${step.side ? ` · ${step.side}` : ''}`}
          </Text>
          {step.kind === 'work' && step.targetReps ? (
            <>
              <Ring ratio={reps / step.targetReps} size={150} stroke={12} color={color}>
                <Text variant="stat" style={{ fontSize: 48, lineHeight: 52 }}>{reps}</Text>
                <Text variant="caption" muted>{`of ${step.targetReps} · ${mmss(elapsed)}`}</Text>
              </Ring>
              <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                {[1, 5].map((n) => (
                  <PressableScale key={n} haptic="tap" onPress={() => setReps((r) => r + n)} accessibilityRole="button" accessibilityLabel={`Add ${n} rep${n > 1 ? 's' : ''}`}
                    style={{ paddingHorizontal: spacing[5], paddingVertical: spacing[3], borderRadius: radius.md, backgroundColor: c.surfaceRaised }}>
                    <Text variant="headline">{`+${n}`}</Text>
                  </PressableScale>
                ))}
                <PressableScale haptic="press" onPress={() => setReps(step.targetReps!)} accessibilityRole="button" accessibilityLabel="All reps done"
                  style={{ paddingHorizontal: spacing[5], paddingVertical: spacing[3], borderRadius: radius.md, backgroundColor: color }}>
                  <Text variant="headline" color="#FFFFFF">Done</Text>
                </PressableScale>
              </View>
            </>
          ) : (
            <Ring ratio={step.seconds ? left / step.seconds : 0} size={150} stroke={12} color={color}>
              <Text variant="stat" style={{ fontSize: 48, lineHeight: 52 }}>{mmss(left)}</Text>
              <Text variant="caption" muted>{paused ? 'Paused' : step.kind === 'work' ? 'Work' : 'Rest'}</Text>
            </Ring>
          )}
        </View>
        <View style={{ minHeight: 40, alignItems: 'center', paddingHorizontal: spacing[3] }} accessibilityLiveRegion="polite">
          <Text variant="callout" color={c.textDim} style={{ textAlign: 'center' }}>{caption}</Text>
        </View>
        {upcoming && step.kind === 'work' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], alignSelf: 'center' }}>
            <ExerciseMedia exerciseId={upcoming.exerciseId} variant="thumb" height={32} />
            <Text variant="caption" muted>{`Up next: ${name(upcoming.exerciseId)}`}</Text>
          </View>
        ) : null}
      </View>
    </Page>
  );
}

/** Keeps the screen on while following along. Guarded: on web the lock can be released before it activates. */
function useScreenAwake() {
  useEffect(() => {
    const tag = 'lb-follow';
    let active = false;
    let gone = false;
    activateKeepAwakeAsync(tag)
      .then(() => {
        active = true;
        if (gone) deactivateKeepAwake(tag).catch(() => {});
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (active) deactivateKeepAwake(tag).catch(() => {});
    };
  }, []);
}
