import type { QuestSlotDto } from '@lb/contracts';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ExerciseMedia } from '@/features/visuals';
import { exerciseName } from '@/features/training/catalog';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Icon, type IconName, PressableScale, Text } from '@/ui';
import { Ring } from '@/ui/fx';

const UNIT: Record<QuestSlotDto['unit'], string> = { reps: 'reps', sec: 's', min: 'min' };

/**
 * One quest slot (docs/plans/HOME_QUESTS_REDESIGN.md §4): progress ring around the move's thumbnail,
 * name, `x / target`, and two controls: +5 (or a hold timer) and ✓ to finish.
 */
export function SlotRow({
  slot,
  done,
  color,
  locked,
  onSet,
  last,
}: {
  slot: QuestSlotDto;
  done: number;
  color: string;
  locked?: boolean;
  onSet: (value: number) => void;
  last?: boolean;
}) {
  const { c, spacing } = useTheme();
  const complete = done >= slot.target;
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(0);
  const name = exerciseName(slot.exerciseId);
  const shown = done + (running ? elapsed : 0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - start.current) / 1000);
      setElapsed(s);
      if (done + s === slot.target) haptics.success();
    }, 250);
    return () => clearInterval(id);
  }, [running, done, slot.target]);

  const toggleTimer = () => {
    if (running) {
      setRunning(false);
      onSet(done + elapsed);
      setElapsed(0);
    } else {
      start.current = Date.now();
      setRunning(true);
      haptics.heavy();
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2], borderBottomWidth: last ? 0 : 1, borderColor: c.border }}
      accessibilityLabel={`${name}: ${Math.min(shown, slot.target)} of ${slot.target} ${UNIT[slot.unit]}${complete ? ', done' : ''}`}>
      <Ring ratio={shown / slot.target} size={48} stroke={4} color={complete ? c.success : color} track="rgba(255,255,255,0.08)">
        {complete ? (
          <Icon name="checkmark" size={20} color={c.success} />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden' }}>
            <ExerciseMedia exerciseId={slot.exerciseId} variant="thumb" height={36} />
          </View>
        )}
      </Ring>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout" numberOfLines={1} color={complete ? c.textDim : c.text} style={{ fontFamily: 'Inter_600SemiBold' }}>{name}</Text>
        <Text variant="caption" color={complete ? c.success : c.textMuted}>
          {complete ? 'Done' : `${Math.min(shown, slot.target * 3)} / ${slot.target} ${UNIT[slot.unit]}`}
        </Text>
      </View>
      {!complete && !locked ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {slot.unit === 'sec' ? (
            <Ctl icon={running ? 'stop' : 'play'} label={running ? `${elapsed}s` : 'Hold'} onPress={toggleTimer} active={running} color={color} />
          ) : (
            <Ctl label="+5" onPress={() => onSet(done + 5)} accessibilityLabel={`Add 5 ${UNIT[slot.unit]}`} />
          )}
          <Ctl icon="checkmark" onPress={() => { haptics.success(); onSet(slot.target); }} accessibilityLabel={`Mark ${name} done`} primary color={color} />
        </View>
      ) : null}
    </View>
  );
}

function Ctl({ label, icon, onPress, primary, active, color, accessibilityLabel }: {
  label?: string; icon?: IconName; onPress: () => void; primary?: boolean; active?: boolean; color?: string; accessibilityLabel?: string;
}) {
  const { c, radius } = useTheme();
  const tint = color ?? c.accent;
  return (
    <PressableScale haptic="tap" onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      style={{
        minWidth: 40, height: 36, paddingHorizontal: label ? 10 : 0, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center',
        borderRadius: radius.pill, backgroundColor: primary ? tint : active ? `${tint}33` : c.surfaceRaised,
        borderWidth: active ? 1 : 0, borderColor: tint,
      }}>
      {icon ? <Icon name={icon} size={16} color={primary ? '#FFFFFF' : c.text} /> : null}
      {label ? <Text variant="caption" color={c.text} style={{ fontFamily: 'Inter_600SemiBold' }}>{label}</Text> : null}
    </PressableScale>
  );
}
