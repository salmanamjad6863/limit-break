import type { PlannedSet } from '@lb/engine';
import { LOAD_STEP, type LoadType } from '@lb/engine';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Button, Icon, PressableScale, Text } from '@/ui';
import { mmss, targetText } from './format';
import type { LoggedEntry } from './session';

function Mini({ label, value, onChange, step, min = 0, format }: { label: string; value: number; onChange: (v: number) => void; step: number; min?: number; format?: (v: number) => string }) {
  const { c, spacing, radius } = useTheme();
  const btn = (dir: 1 | -1) => (
    <PressableScale
      haptic="tap"
      onPress={() => onChange(Math.max(min, Math.round((value + dir * step) * 100) / 100))}
      accessibilityRole="button"
      accessibilityLabel={`${dir > 0 ? 'Increase' : 'Decrease'} ${label}`}
      style={{ width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}>
      <Icon name={dir > 0 ? 'add' : 'remove'} size={18} color={c.text} />
    </PressableScale>
  );
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text variant="micro" muted>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[1], backgroundColor: c.surfaceRaised, borderRadius: radius.md, padding: 4 }}>
        {btn(-1)}
        <Text variant="stat" style={{ fontSize: 24, lineHeight: 28 }}>{format ? format(value) : value}</Text>
        {btn(1)}
      </View>
    </View>
  );
}

/** One planned set: logged summary, or the active input row. */
export function SetRow({
  index,
  label,
  planned,
  logged,
  active,
  loadType,
  bodyweight,
  unilateral,
  defaultReps,
  defaultLoad,
  onLog,
}: {
  index: number;
  label: string;
  planned: PlannedSet;
  logged?: LoggedEntry;
  active: boolean;
  loadType: LoadType;
  bodyweight: boolean;
  unilateral?: boolean;
  defaultReps: number | null;
  defaultLoad: number | null;
  onLog: (e: { reps: number | null; loadKg: number | null; rir: number | null; durationS: number | null; setType?: 'normal' | 'drop' | 'failure' }) => void;
}) {
  const { c, spacing, radius } = useTheme();
  const step = LOAD_STEP[loadType];
  const timed = !!planned.seconds;
  const [reps, setReps] = useState(defaultReps ?? planned.reps?.[1] ?? 8);
  const [load, setLoad] = useState<number>(planned.loadKg ?? defaultLoad ?? 0);
  const [rir, setRir] = useState<number>(planned.rir);
  const [setType, setSetType] = useState<'normal' | 'drop' | 'failure'>('normal');
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);

  // follow coach auto-adjustments until the user edits
  useEffect(() => {
    if (planned.loadKg != null) setLoad(planned.loadKg);
  }, [planned.loadKg]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - started.current) / 1000);
      setElapsed(s);
      if (planned.seconds && s === planned.seconds[1]) haptics.success();
    }, 250);
    return () => clearInterval(id);
  }, [running, planned.seconds]);

  const done = !!logged;
  return (
    <View
      style={{
        borderRadius: radius.md, padding: spacing[3], gap: spacing[3],
        backgroundColor: active ? `${c.accent}12` : 'transparent', borderWidth: 1, borderColor: active ? `${c.accent}55` : c.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.success : c.surfaceRaised }}>
          {done ? <Icon name="checkmark" size={16} color="#07070B" /> : <Text variant="micro" color={planned.kind === 'warmup' ? c.textMuted : c.text}>{label}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          {done ? (
            <Text variant="callout">
              {logged.durationS != null
                ? `${logged.durationS} s`
                : `${logged.reps} reps${logged.loadKg ? ` × ${logged.loadKg} kg` : ''}${logged.rir != null && planned.kind === 'working' ? ` · RIR ${logged.rir}` : ''}${logged.setType === 'drop' ? ' · drop set' : logged.setType === 'failure' ? ' · to failure' : ''}`}
            </Text>
          ) : (
            <Text variant="callout" color={active ? c.text : c.textDim}>{targetText(planned, { bodyweight, unilateral })}</Text>
          )}
          {planned.kind === 'warmup' ? <Text variant="caption" muted>Warm-up</Text> : null}
          {active && !done && planned.kind === 'working' && defaultReps != null ? (
            <Text variant="caption" muted>{`Last time: ${defaultReps} reps${defaultLoad ? ` × ${defaultLoad} kg` : ''}`}</Text>
          ) : null}
        </View>
      </View>

      {active && !done ? (
        timed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <Text variant="stat" color={running ? c.accentGlow : c.text} style={{ minWidth: 72 }}>{mmss(elapsed)}</Text>
            <View style={{ flex: 1 }}>
              <Button
                label={running ? 'Stop & log' : 'Start timer'}
                icon={running ? 'stop' : 'play'}
                variant={running ? 'primary' : 'secondary'}
                onPress={() => {
                  if (running) {
                    setRunning(false);
                    onLog({ reps: null, loadKg: null, rir: null, durationS: Math.max(1, elapsed) });
                  } else {
                    started.current = Date.now();
                    setElapsed(0);
                    setRunning(true);
                    haptics.heavy();
                  }
                }}
              />
            </View>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <Mini label="Reps" value={reps} onChange={setReps} step={1} />
              {step ? <Mini label="Load (kg)" value={load} onChange={setLoad} step={step} format={(v) => (v === 0 ? '—' : String(v))} /> : null}
            </View>
            {planned.kind === 'working' ? (
              <View style={{ gap: 6 }}>
                <Text variant="micro" muted>Reps left in the tank (RIR)</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[0, 1, 2, 3, 4].map((v) => (
                    <PressableScale
                      key={v}
                      haptic="tap"
                      onPress={() => setRir(v)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: rir === v }}
                      accessibilityLabel={`RIR ${v}`}
                      style={{
                        flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm,
                        backgroundColor: rir === v ? c.accent : c.surfaceRaised,
                      }}>
                      <Text variant="callout" color={rir === v ? '#FFFFFF' : c.textDim}>{v === 4 ? '4+' : v}</Text>
                    </PressableScale>
                  ))}
                </View>
              </View>
            ) : null}
            {planned.kind === 'working' ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['normal', 'drop', 'failure'] as const).map((t) => (
                  <PressableScale key={t} haptic="tap" onPress={() => { setSetType(t); if (t === 'failure') setRir(0); }}
                    accessibilityRole="radio" accessibilityState={{ selected: setType === t }} accessibilityLabel={t === 'normal' ? 'Normal set' : t === 'drop' ? 'Drop set' : 'Taken to failure'}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: setType === t ? (t === 'failure' ? c.danger : t === 'drop' ? c.mana : c.accent) : c.border }}>
                    <Text variant="caption" color={setType === t ? c.text : c.textMuted}>{t === 'normal' ? 'Normal' : t === 'drop' ? 'Drop set' : 'To failure'}</Text>
                  </PressableScale>
                ))}
              </View>
            ) : null}
            <Button
              label={`Log set ${index + 1}`}
              icon="checkmark"
              onPress={() => onLog({ reps, loadKg: step ? (load > 0 ? load : null) : null, rir: planned.kind === 'working' ? rir : null, durationS: null, setType })}
            />
          </>
        )
      ) : null}
    </View>
  );
}
