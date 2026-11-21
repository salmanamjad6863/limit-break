/**
 * Log mode (docs/plans/TRAIN_REDESIGN.md §3.3): every exercise as a card with a set table
 * SET · PREVIOUS · KG · REPS · RIR · ✓ (Hevy/Strong style). Suggested values sit in grey as placeholders;
 * ✓ logs the set (typed value, else the suggestion) and starts the rest timer. Same session store as Guided.
 */
import { LOAD_STEP, type PlannedSet } from '@lb/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { ExerciseMedia } from '@/features/visuals';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Card, Icon, PressableScale, Text } from '@/ui';
import { exerciseById } from './catalog';
import { mmss, range, ROLE_LABEL } from './format';
import type { ActiveSession, LoggedEntry } from './session';

type LogInput = { reps: number | null; loadKg: number | null; rir: number | null; durationS: number | null };

export function LogView({
  active, lastSet, notes, onLog, onAddSet, onSwap, onAddExercise,
}: {
  active: ActiveSession;
  lastSet: Record<string, { reps: number | null; loadKg: number | null }>;
  notes: Record<string, string>;
  onLog: (exIndex: number, setIndex: number, e: LogInput) => void;
  onAddSet: (exIndex: number) => void;
  onSwap: (exIndex: number) => void;
  onAddExercise: () => void;
}) {
  const { c, spacing } = useTheme();
  return (
    <View style={{ gap: spacing[4] }}>
      {active.exercises.map((pe, k) => (
        <ExerciseTable key={`${k}-${pe.exerciseId}`} k={k} active={active} prev={lastSet[pe.exerciseId]} note={notes[pe.exerciseId]}
          onLog={onLog} onAddSet={onAddSet} onSwap={onSwap} />
      ))}
      <PressableScale haptic="tap" onPress={onAddExercise} accessibilityRole="button" accessibilityLabel="Add exercise"
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed' }}>
        <Icon name="add" size={18} color={c.textDim} />
        <Text variant="callout" dim>Add exercise</Text>
      </PressableScale>
    </View>
  );
}

function ExerciseTable({ k, active, prev, note, onLog, onAddSet, onSwap }: {
  k: number; active: ActiveSession; prev?: { reps: number | null; loadKg: number | null }; note?: string;
  onLog: (exIndex: number, setIndex: number, e: LogInput) => void; onAddSet: (exIndex: number) => void; onSwap: (exIndex: number) => void;
}) {
  const { c, spacing } = useTheme();
  const pe = active.exercises[k]!;
  const ex = exerciseById.get(pe.exerciseId);
  const logs = active.logs[k] ?? [];
  const next = logs.length;
  const done = next >= pe.sets.length;
  const weighted = !!ex && LOAD_STEP[ex.loadType] != null;
  const timed = pe.sets.some((s) => !!s.seconds);
  const prevText = prev?.reps != null ? `${prev.loadKg ? `${prev.loadKg}×` : ''}${prev.reps}` : '–';
  let working = 0;

  return (
    <Card padded={false} style={done ? { borderColor: `${c.success}55` } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingBottom: spacing[2] }}>
        <PressableScale haptic="tap" onPress={() => router.push(`/exercise/${pe.exerciseId}`)} accessibilityRole="button" accessibilityLabel={`${ex?.name ?? pe.exerciseId} details`}>
          <ExerciseMedia exerciseId={pe.exerciseId} variant="thumb" height={44} />
        </PressableScale>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="callout" numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>{ex?.name ?? pe.exerciseId}</Text>
          <Text variant="caption" muted numberOfLines={1}>
            {`${ROLE_LABEL[pe.role] ?? pe.role} · rest ${mmss(pe.restSeconds)}${pe.supersetGroup ? ` · superset ${pe.supersetGroup}` : ''}${ex?.unilateral ? ' · each side' : ''}`}
          </Text>
        </View>
        {done ? <Icon name="checkmark-circle" size={20} color={c.success} /> : null}
        <PressableScale haptic="tap" onPress={() => onSwap(k)} accessibilityRole="button" accessibilityLabel={`Swap ${ex?.name ?? 'exercise'}`}
          style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised }}>
          <Icon name="swap-horizontal" size={16} color={c.textDim} />
        </PressableScale>
      </View>
      {note ? (
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: spacing[3], paddingBottom: spacing[2] }}>
          <Icon name="bookmark" size={12} color={c.warning} />
          <Text variant="caption" dim style={{ flex: 1 }}>{note}</Text>
        </View>
      ) : null}

      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[3], paddingVertical: 6, gap: 6 }}>
        <Col w={34}><Text variant="micro" muted>SET</Text></Col>
        <Col flex><Text variant="micro" muted>PREVIOUS</Text></Col>
        {timed ? (
          <Col w={64}><Text variant="micro" muted>SEC</Text></Col>
        ) : (
          <>
            {weighted ? <Col w={58}><Text variant="micro" muted>KG</Text></Col> : null}
            <Col w={50}><Text variant="micro" muted>REPS</Text></Col>
            <Col w={40}><Text variant="micro" muted>RIR</Text></Col>
          </>
        )}
        <Col w={38}><Icon name="checkmark" size={14} color={c.textMuted} /></Col>
      </View>

      {pe.sets.map((s, i) => {
        if (s.kind === 'working') working++;
        return (
          <LogRow key={i} label={s.kind === 'warmup' ? 'W' : String(working)} planned={s} logged={logs[i]} enabled={i === next}
            prev={s.kind === 'working' ? prevText : '–'} weighted={weighted} timed={!!s.seconds}
            onLog={(e) => onLog(k, i, e)} />
        );
      })}

      <PressableScale haptic="tap" onPress={() => onAddSet(k)} accessibilityRole="button" accessibilityLabel={`Add a set to ${ex?.name ?? 'exercise'}`}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, margin: spacing[3], marginTop: spacing[2], minHeight: 36, borderRadius: 10, backgroundColor: c.surfaceRaised }}>
        <Icon name="add" size={16} color={c.textDim} />
        <Text variant="caption" dim>Add set</Text>
      </PressableScale>
    </Card>
  );
}

function Col({ w, flex, children }: { w?: number; flex?: boolean; children: React.ReactNode }) {
  return <View style={{ width: w, flex: flex ? 1 : undefined, alignItems: 'center' }}>{children}</View>;
}

function LogRow({ label, planned, logged, enabled, prev, weighted, timed, onLog }: {
  label: string; planned: PlannedSet; logged?: LoggedEntry; enabled: boolean; prev: string; weighted: boolean; timed: boolean;
  onLog: (e: LogInput) => void;
}) {
  const { c, spacing } = useTheme();
  const [kg, setKg] = useState('');
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState('');
  const [sec, setSec] = useState('');
  const done = !!logged;
  const warm = planned.kind === 'warmup';
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const sugReps = planned.reps?.[1] ?? null;

  const log = () => {
    haptics.press();
    if (timed) {
      onLog({ reps: null, loadKg: null, rir: null, durationS: Math.max(1, Math.round(num(sec) ?? planned.seconds?.[1] ?? 30)) });
      return;
    }
    const r = num(reps) ?? sugReps;
    const l = weighted ? (num(kg) ?? planned.loadKg) : null;
    onLog({ reps: r, loadKg: l && l > 0 ? l : null, rir: warm ? null : (num(rir) ?? planned.rir), durationS: null });
  };

  const show = (v: number | null | undefined) => (v == null ? '–' : String(v));
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], paddingVertical: 5,
      backgroundColor: done ? `${c.success}14` : enabled ? `${c.accent}10` : 'transparent', opacity: !done && !enabled ? 0.55 : 1,
    }}>
      <Col w={34}>
        <View style={{ minWidth: 26, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: warm ? `${c.warning}22` : c.surfaceRaised }}>
          <Text variant="caption" color={warm ? c.warning : c.text} style={{ fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
        </View>
      </Col>
      <Col flex><Text variant="caption" muted numberOfLines={1}>{prev}</Text></Col>
      {timed ? (
        <Col w={64}>
          {done ? <Cell text={`${logged.durationS ?? '–'}`} /> : (
            <Field value={sec} onChange={setSec} placeholder={planned.seconds ? range(planned.seconds) : '30'} editable={enabled} label="Seconds" />
          )}
        </Col>
      ) : (
        <>
          {weighted ? (
            <Col w={58}>{done ? <Cell text={show(logged.loadKg)} /> : <Field value={kg} onChange={setKg} placeholder={show(planned.loadKg)} editable={enabled} decimal label="Weight in kg" />}</Col>
          ) : null}
          <Col w={50}>{done ? <Cell text={show(logged.reps)} /> : <Field value={reps} onChange={setReps} placeholder={planned.reps ? range(planned.reps) : '–'} editable={enabled} label="Reps" />}</Col>
          <Col w={40}>{done ? <Cell text={warm ? '–' : show(logged.rir)} /> : warm ? <Cell text="–" /> : <Field value={rir} onChange={setRir} placeholder={String(planned.rir)} editable={enabled} label="Reps in reserve" />}</Col>
        </>
      )}
      <Col w={38}>
        <PressableScale haptic="none" onPress={log} disabled={!enabled || done} accessibilityRole="button"
          accessibilityLabel={done ? `Set ${label} logged` : `Log set ${label}`} accessibilityState={{ disabled: !enabled || done, checked: done }}
          style={{ width: 34, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.success : enabled ? c.accent : c.surfaceRaised }}>
          <Icon name="checkmark" size={18} color={done ? '#07070B' : enabled ? '#FFFFFF' : c.textMuted} />
        </PressableScale>
      </Col>
    </View>
  );
}

function Cell({ text }: { text: string }) {
  return <Text variant="callout" style={{ fontFamily: 'Inter_600SemiBold' }}>{text}</Text>;
}

function Field({ value, onChange, placeholder, editable, decimal, label }: {
  value: string; onChange: (v: string) => void; placeholder: string; editable: boolean; decimal?: boolean; label: string;
}) {
  const { c } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(decimal ? /[^0-9.,]/g : /[^0-9]/g, '').slice(0, 6))}
      placeholder={placeholder}
      placeholderTextColor={c.textMuted}
      editable={editable}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      returnKeyType="done"
      selectTextOnFocus
      accessibilityLabel={label}
      style={{
        width: '100%', height: 32, borderRadius: 8, textAlign: 'center', paddingVertical: 0,
        color: c.text, fontFamily: 'Inter_600SemiBold', fontSize: 15, backgroundColor: c.surfaceRaised,
      }}
    />
  );
}
