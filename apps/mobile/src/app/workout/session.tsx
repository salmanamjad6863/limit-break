import { Redirect, router } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { endRestActivity, startRestActivity, updateRestActivity, useGymMode } from '@/features/depth';
import { haptics } from '@/lib/haptics';
import { canPerform, startingLoad } from '@lb/engine';
import {
  catalog,
  exerciseById,
  exerciseName,
  patternLabel,
  StaleSessionCard,
  usePersonalContext,
  useStaleSession,
  useTraining,
  useWorkoutSession,
} from '@/features/training';
import { LogView } from '@/features/training/LogView';
import { ExerciseMedia } from '@/features/visuals';
import { mmss, ROLE_LABEL } from '@/features/training/format';
import { SetRow } from '@/features/training/SetRow';
import { useHistoryActions } from '@/features/training/history';
import { TextField } from '@/ui/form';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, Pill, PressableScale, Text } from '@/ui';
import { Ring } from '@/ui/fx';
import { usePainFlags } from '@/features/training/sync';

export default function WorkoutSession() {
  const { c, spacing, radius } = useTheme();
  const gymMode = useGymMode((s) => s.enabled);
  const active = useWorkoutSession((s) => s.active);
  const logSet = useWorkoutSession((s) => s.logSet);
  const go = useWorkoutSession((s) => s.go);
  const swap = useWorkoutSession((s) => s.swap);
  const startRest = useWorkoutSession((s) => s.startRest);
  const clearRest = useWorkoutSession((s) => s.clearRest);
  const end = useWorkoutSession((s) => s.end);
  const addSet = useWorkoutSession((s) => s.addSet);
  const addExercise = useWorkoutSession((s) => s.addExercise);
  const setView = useWorkoutSession((s) => s.setView);
  const stale = useStaleSession();
  const ctx = usePersonalContext();
  const lastSet = useTraining((s) => s.lastSet);
  const { flagPain } = usePainFlags();
  const [now, setNow] = useState(Date.now());
  const [showHow, setShowHow] = useState(false);
  const [sheet, setSheet] = useState<'none' | 'swap' | 'pain' | 'exit' | 'note' | 'add'>('none');
  const [addQuery, setAddQuery] = useState('');
  const notes = useTraining((s) => s.notes);
  const { setNote } = useHistoryActions();
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (active?.restUntil && now >= active.restUntil) {
      haptics.success();
      clearRest();
    }
  }, [now, active?.restUntil, clearRest]);

  // Gym Mode: keep the screen awake for the whole session (SYSTEMS.md §6.3).
  useEffect(() => {
    if (!gymMode || !active) return;
    const tag = 'lb-gym';
    let on = false;
    let gone = false;
    activateKeepAwakeAsync(tag)
      .then(() => {
        on = true;
        if (gone) deactivateKeepAwake(tag).catch(() => {});
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (on) deactivateKeepAwake(tag).catch(() => {});
    };
  }, [gymMode, active]);

  // Live Activity / ongoing rest notification hook (no-op until native rebuild).
  const restingNow = !!(active?.restUntil && active.restUntil > now);
  const restLeftNow = restingNow && active ? Math.ceil((active.restUntil! - now) / 1000) : 0;
  useEffect(() => {
    if (!active) return;
    if (!restingNow) {
      void endRestActivity();
      return;
    }
    const i = active.current;
    const pe = active.exercises[i]!;
    const ex = exerciseById.get(pe.exerciseId);
    const logs = active.logs[i] ?? [];
    const exerciseDone = logs.length >= pe.sets.length;
    const isLast = i === active.exercises.length - 1;
    const nextLabel = exerciseDone
      ? isLast
        ? 'Finish workout'
        : exerciseName(active.exercises[i + 1]!.exerciseId)
      : `${ex?.name ?? 'Exercise'} · ${setLabel(pe.sets, logs.length)}`;
    const payload = { exerciseName: ex?.name ?? 'Rest', secondsLeft: restLeftNow, upNext: nextLabel };
    void startRestActivity(payload);
    void updateRestActivity(payload);
  }, [active, restingNow, restLeftNow]);

  if (!active) return <Redirect href="/train" />;

  // an abandoned session asks "save or discard?" instead of showing a 1000-minute timer
  if (stale) {
    return (
      <Page header={<View style={{ paddingHorizontal: spacing[4], paddingTop: spacing[2] }}>
        <PressableScale haptic="tap" onPress={() => router.dismissTo('/train')} accessibilityRole="button" accessibilityLabel="Back to Train"
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised }}>
          <Icon name="close" size={20} color={c.text} />
        </PressableScale>
      </View>}>
        <StaleSessionCard a={stale.active} finishAt={stale.finishAt} canSave={stale.canSave} />
      </Page>
    );
  }

  const i = active.current;
  const pe = active.exercises[i]!;
  const ex = exerciseById.get(pe.exerciseId)!;
  const logs = active.logs[i] ?? [];
  const nextSetIndex = logs.length;
  const exerciseDone = nextSetIndex >= pe.sets.length;
  const isLast = i === active.exercises.length - 1;
  const elapsed = Math.floor((now - Date.parse(active.startedAt)) / 1000);
  const resting = active.restUntil != null && active.restUntil > now;
  const restLeft = resting ? Math.ceil((active.restUntil! - now) / 1000) : 0;
  const bodyweight = ex.loadType === 'bodyweight' || ex.loadType === 'none';
  const workingIdx = (k: number) =>
    pe.sets.slice(0, k + 1).filter((s) => s.kind === 'working').length;
  const doneCount = active.exercises.filter(
    (x, k) => (active.logs[k]?.length ?? 0) >= x.sets.length,
  ).length;

  const upNext = exerciseDone
    ? isLast
      ? 'Finish workout'
      : exerciseName(active.exercises[i + 1]!.exerciseId)
    : `${ex.name} · ${setLabel(pe.sets, nextSetIndex)}`;
  const upNextId = exerciseDone ? (isLast ? null : active.exercises[i + 1]!.exerciseId) : ex.id;
  const view = active.view ?? 'guided';
  const totalSets = active.exercises.reduce((n, x) => n + x.sets.length, 0);
  const loggedSets = Object.values(active.logs).reduce((n, l) => n + l.length, 0);

  /** log a set (either view), then rest: shorter after warm-ups, capped between exercises */
  const logAndRest = (k: number, setIndex: number, e: { reps: number | null; loadKg: number | null; rir: number | null; durationS: number | null; setType?: 'normal' | 'drop' | 'failure' }) => {
    const x = active.exercises[k]!;
    const planned = x.sets[setIndex]!;
    if (k !== i) go(k);
    logSet(k, { setIndex, isWarmup: planned.kind === 'warmup', ...e });
    const finishedExercise = setIndex === x.sets.length - 1;
    const lastExercise = k === active.exercises.length - 1;
    if (!finishedExercise) startRest(planned.kind === 'warmup' ? 60 : x.restSeconds);
    else if (!lastExercise) startRest(Math.min(x.restSeconds, 120));
  };
  const swapTo = (id: string) => {
    const next = exerciseById.get(id);
    const firstWorking = pe.sets.find((x) => x.kind === 'working') ?? pe.sets[0];
    swap(i, id, next && firstWorking ? startingLoad(next, firstWorking, ctx) : null);
  };
  const usedIds = new Set(active.exercises.map((x) => x.exerciseId));
  const addCandidates = catalog
    .filter((e) => !usedIds.has(e.id) && canPerform(e, ctx))
    .filter((e) => !addQuery.trim() || e.name.toLowerCase().includes(addQuery.trim().toLowerCase()))
    .slice(0, 40);
  const addToSession = (id: string) => {
    const next = exerciseById.get(id);
    const load = next ? startingLoad(next, { reps: [8, 12], rir: 2 }, ctx) : null;
    addExercise(id, load);
    setSheet('none');
    setAddQuery('');
    go(active.exercises.length);
  };
  const finishButton = (
    <Button
      size="md"
      icon="flag"
      label={doneCount === active.exercises.length ? 'Finish' : 'Finish early'}
      onPress={() => router.replace('/workout/flow?kind=cooldown')}
    />
  );
  const restCard = (compact: boolean) => (
    <Card tint={c.accent}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
        <Ring
          ratio={restLeft / Math.max(1, active.restTotal || restLeft)}
          size={compact ? 56 : gymMode ? 112 : 84}
          stroke={compact ? 6 : gymMode ? 10 : 8}
          color={c.accent}
        >
          <Text variant="stat" style={{ fontSize: compact ? 15 : gymMode ? 28 : 22, lineHeight: compact ? 18 : gymMode ? 32 : 26 }}>
            {mmss(restLeft)}
          </Text>
        </Ring>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" color={c.accentGlow}>Rest</Text>
          <Text variant="caption" muted>Up next</Text>
          <Text variant="callout" numberOfLines={1}>{upNext}</Text>
        </View>
        {!compact && upNextId && upNextId !== ex.id ? <ExerciseMedia exerciseId={upNextId} variant="thumb" height={56} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" size="md" label="+30 s" onPress={() => startRest(restLeft + 30)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" size="md" label="Skip rest" onPress={clearRest} />
        </View>
      </View>
    </Card>
  );

  return (
    <View style={{ flex: 1 }}>
      <Page
        header={
          <View style={{ paddingHorizontal: spacing[4], paddingTop: spacing[2], gap: spacing[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <PressableScale
                haptic="tap"
                onPress={() => setSheet('exit')}
                accessibilityRole="button"
                accessibilityLabel="End workout"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.surfaceRaised,
                }}
              >
                <Icon name="close" size={20} color={c.text} />
              </PressableScale>
              <View style={{ flex: 1 }}>
                <Text variant="heading" numberOfLines={1}>
                  {active.name}
                </Text>
                <Text
                  variant="caption"
                  muted
                >{view === 'log' ? `${loggedSets} of ${totalSets} sets` : `Exercise ${i + 1} of ${active.exercises.length}`}</Text>
              </View>
              {gymMode ? <Pill icon="phone-landscape-outline" label="Gym" color={c.mana} /> : null}
              <Pill icon="time-outline" label={mmss(elapsed)} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
              {active.exercises.map((x, k) => {
                const full = (active.logs[k]?.length ?? 0) >= x.sets.length;
                return (
                  <PressableScale
                    key={k}
                    haptic="tap"
                    onPress={() => go(k)}
                    accessibilityLabel={`Go to exercise ${k + 1}`}
                    style={{ flex: 1, paddingVertical: 4 }}
                  >
                    <View
                      style={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: full ? c.success : k === i ? c.accent : c.track,
                      }}
                    />
                  </PressableScale>
                );
              })}
            </View>
            <ViewToggle view={view} onChange={setView} />
            </View>
          </View>
        }
        footer={
          view === 'log' ? (resting ? restCard(true) : finishButton) : (
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Button
                variant="secondary"
                size="md"
                icon="chevron-back"
                label="Prev"
                disabled={i === 0}
                onPress={() => go(i - 1)}
              />
            </View>
            <View style={{ flex: 2 }}>
              {isLast ? (
                finishButton
              ) : (
                <Button
                  size="md"
                  variant={exerciseDone ? 'primary' : 'secondary'}
                  label="Next exercise"
                  onPress={() => go(i + 1)}
                />
              )}
            </View>
          </View>
          )
        }
      >
        {view === 'log' && active.coachNote ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[3], borderRadius: radius.md, backgroundColor: `${c.mana}1A` }}>
            <Icon name="sparkles" size={16} color={c.mana} />
            <Text variant="callout" color={c.mana} style={{ flex: 1 }}>{active.coachNote}</Text>
          </View>
        ) : null}
        {view === 'log' ? (
          <LogView active={active} lastSet={lastSet} notes={notes} onLog={logAndRest} onAddSet={addSet}
            onSwap={(k) => { if (k !== i) go(k); setSheet('swap'); }}
            onAddExercise={() => { setAddQuery(''); setSheet('add'); }} />
        ) : (
        <>
        <Card>
          <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
            <Pill
              label={ROLE_LABEL[pe.role] ?? pe.role}
              color={pe.role === 'main' ? c.accentGlow : c.textDim}
            />
            <Pill label={patternLabel(ex.pattern)} />
            {ex.unilateral ? <Pill label="Each side" color={c.mana} /> : null}
            {pe.supersetGroup ? (
              <Pill icon="git-compare-outline" color={c.warning}
                label={`Superset ${pe.supersetGroup}${active.exercises.filter((x, k) => x.supersetGroup === pe.supersetGroup && k <= i).length} · alternate sets`} />
            ) : null}
          </View>
          <Text variant="title" style={{ fontSize: 24, lineHeight: 30 }}>
            {ex.name}
          </Text>
          <ExerciseMedia exerciseId={ex.id} variant="card" height={190} />
          <PressableScale
            haptic="tap"
            onPress={() => setShowHow((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="How to"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Icon
              name={showHow ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={c.accentGlow}
            />
            <Text variant="callout" color={c.accentGlow}>
              How to do it
            </Text>
          </PressableScale>
          {showHow ? (
            <View style={{ gap: spacing[2] }}>
              {ex.cues.map((cue, k) => (
                <View key={k} style={{ flexDirection: 'row', gap: spacing[2] }}>
                  <Text variant="callout" color={c.accentGlow}>
                    {k + 1}
                  </Text>
                  <Text variant="callout" style={{ flex: 1 }}>
                    {cue}
                  </Text>
                </View>
              ))}
              {ex.mistakes.length ? (
                <Text
                  variant="caption"
                  color={c.warning}
                >{`Avoid: ${ex.mistakes.join(' · ')}`}</Text>
              ) : null}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
            <Chip icon="swap-horizontal" label="Swap" onPress={() => setSheet('swap')} />
            <Chip icon="medkit-outline" label="This hurts" onPress={() => setSheet('pain')} />
            <Chip icon="create-outline" label="Note" onPress={() => { setNoteDraft(notes[ex.id] ?? ''); setSheet('note'); }} />
            <Chip
              icon="information-circle-outline"
              label="Details"
              onPress={() => router.push(`/exercise/${ex.id}`)}
            />
          </View>
          {notes[ex.id] ? (
            <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' }}>
              <Icon name="bookmark" size={14} color={c.warning} />
              <Text variant="callout" color={c.textDim} style={{ flex: 1 }}>{notes[ex.id]}</Text>
            </View>
          ) : null}
        </Card>

        {active.coachNote ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[2],
              padding: spacing[3],
              borderRadius: radius.md,
              backgroundColor: `${c.mana}1A`,
            }}
          >
            <Icon name="sparkles" size={16} color={c.mana} />
            <Text variant="callout" color={c.mana} style={{ flex: 1 }}>
              {active.coachNote}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: spacing[2] }}>
          {pe.sets.map((s, k) => (
            <SetRow
              key={`${pe.exerciseId}-${k}`}
              index={k}
              label={s.kind === 'warmup' ? `W${k + 1}` : String(workingIdx(k))}
              planned={s}
              logged={logs[k]}
              active={k === nextSetIndex && !resting}
              loadType={ex.loadType}
              bodyweight={bodyweight}
              unilateral={ex.unilateral}
              defaultReps={lastSet[ex.id]?.reps ?? null}
              defaultLoad={lastSet[ex.id]?.loadKg ?? null}
              large={gymMode}
              onLog={(e) => {
                haptics.press();
                logAndRest(i, k, e);
              }}
            />
          ))}
        </View>

        {resting ? (
          restCard(false)
        ) : exerciseDone ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Icon name="checkmark-circle" size={20} color={c.success} />
              <Text variant="heading">{isLast ? 'Last exercise done' : 'Exercise complete'}</Text>
            </View>
            <Text variant="callout" dim>
              {isLast ? 'Finish to see your results and XP.' : `Up next: ${upNext}`}
            </Text>
          </Card>
        ) : null}
        </>
        )}
      </Page>
      {sheet !== 'none' ? (
        <View style={{ position: 'absolute', inset: 0, justifyContent: 'flex-end' }}>
          <PressableScale
            haptic="none"
            scaleTo={1}
            onPress={() => setSheet('none')}
            accessibilityLabel="Close sheet"
            style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          >
            <View />
          </PressableScale>
          <View
            style={{
              padding: spacing[3],
              paddingBottom: spacing[8],
              width: '100%',
              maxWidth: 560,
              alignSelf: 'center',
            }}
          >
            <Card style={{ borderColor: c.borderStrong }}>
              {sheet === 'note' ? (
                <>
                  <Text variant="heading">{`Note for ${ex.name}`}</Text>
                  <Text variant="callout" dim>Shown every time you do this exercise: seat height, grip, cues that work for you.</Text>
                  <TextField label="Note" placeholder="e.g. Seat 4, grip just outside the rings" value={noteDraft} onChangeText={setNoteDraft} maxLength={300} />
                  <Button label="Save note" icon="checkmark" onPress={() => { setNote.mutate({ exerciseId: ex.id, note: noteDraft }); setSheet('none'); }} />
                  <Button variant="ghost" label="Cancel" onPress={() => setSheet('none')} />
                </>
              ) : sheet === 'exit' ? (
                <>
                  <Text variant="heading">End this workout?</Text>
                  <Text variant="callout" dim>
                    Your logged sets are saved. Finish to get XP for what you did, or discard it.
                  </Text>
                  <Button
                    label="Finish & save"
                    icon="flag"
                    onPress={() => router.replace('/workout/debrief')}
                  />
                  <Button
                    variant="secondary"
                    label="Discard workout"
                    onPress={() => {
                      end();
                      router.replace('/train');
                    }}
                  />
                  <Button variant="ghost" label="Keep going" onPress={() => setSheet('none')} />
                </>
              ) : sheet === 'add' ? (
                <>
                  <Text variant="heading">Add exercise</Text>
                  <Text variant="callout" dim>Fits your equipment. Three working sets to start — add more as you go.</Text>
                  <TextField label="Search" placeholder="e.g. curl, squat" value={addQuery} onChangeText={setAddQuery} autoFocus />
                  {addCandidates.length === 0 ? (
                    <Text variant="callout" muted>No matching exercises for your kit.</Text>
                  ) : null}
                  {addCandidates.map((e) => (
                    <PressableScale
                      key={e.id}
                      haptic="press"
                      onPress={() => addToSession(e.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${e.name}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing[3],
                        padding: spacing[3],
                        borderRadius: radius.md,
                        backgroundColor: c.surfaceRaised,
                      }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="callout">{e.name}</Text>
                        <Text variant="caption" muted>{patternLabel(e.pattern)}</Text>
                      </View>
                      <Icon name="add" size={16} />
                    </PressableScale>
                  ))}
                  <Button variant="ghost" label="Cancel" onPress={() => setSheet('none')} />
                </>
              ) : (
                <>
                  <Text variant="heading">
                    {sheet === 'pain' ? 'Let’s protect that' : 'Swap exercise'}
                  </Text>
                  <Text variant="callout" dim>
                    {sheet === 'pain'
                      ? `${ex.name} will be left out of future workouts. Pick an alternative that feels comfortable, or skip it today.`
                      : 'Same movement pattern, fits your equipment.'}
                  </Text>
                  {pe.alternatives.length === 0 ? (
                    <Text variant="callout" muted>
                      No alternatives for your equipment.
                    </Text>
                  ) : null}
                  {pe.alternatives.map((id) => (
                    <PressableScale
                      key={id}
                      haptic="press"
                      onPress={() => {
                        if (sheet === 'pain') flagPain(ex.id);
                        swapTo(id);
                        setSheet('none');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Swap to ${exerciseName(id)}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing[3],
                        padding: spacing[3],
                        borderRadius: radius.md,
                        backgroundColor: c.surfaceRaised,
                      }}
                    >
                      <Text variant="callout" style={{ flex: 1 }}>
                        {exerciseName(id)}
                      </Text>
                      <Icon name="swap-horizontal" size={16} />
                    </PressableScale>
                  ))}
                  {sheet === 'pain' ? (
                    <Button
                      variant="secondary"
                      label="Skip it today"
                      onPress={() => {
                        flagPain(ex.id);
                        setSheet('none');
                        if (!isLast) go(i + 1);
                      }}
                    />
                  ) : null}
                  <Button variant="ghost" label="Cancel" onPress={() => setSheet('none')} />
                </>
              )}
            </Card>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Chip({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  onPress: () => void;
}) {
  const { c, radius } = useTheme();
  return (
    <PressableScale
      haptic="tap"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: radius.pill,
        backgroundColor: c.surfaceRaised,
      }}
    >
      <Icon name={icon} size={15} color={c.textDim} />
      <Text variant="caption" dim>
        {label}
      </Text>
    </PressableScale>
  );
}

function ViewToggle({ view, onChange }: { view: 'guided' | 'log'; onChange: (v: 'guided' | 'log') => void }) {
  const { c, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', padding: 2, borderRadius: radius.pill, backgroundColor: c.surfaceRaised }} accessibilityRole="radiogroup" accessibilityLabel="Workout view">
      {(['guided', 'log'] as const).map((v) => {
        const on = v === view;
        return (
          <PressableScale key={v} haptic="tap" onPress={() => onChange(v)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            accessibilityLabel={v === 'guided' ? 'Guided: one exercise at a time' : 'Log: every set in a table'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: radius.pill, backgroundColor: on ? c.accent : 'transparent' }}>
            <Icon name={v === 'guided' ? 'play-circle-outline' : 'list'} size={14} color={on ? '#FFFFFF' : c.textDim} />
            <Text variant="caption" color={on ? '#FFFFFF' : c.textDim}>{v === 'guided' ? 'Guided' : 'Log'}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** "warm-up" or "set 2" (working sets numbered on their own, like the table) */
function setLabel(sets: { kind: 'warmup' | 'working' }[], index: number): string {
  const s = sets[index];
  if (!s) return 'next set';
  if (s.kind === 'warmup') return 'warm-up';
  return `set ${sets.slice(0, index + 1).filter((x) => x.kind === 'working').length}`;
}
