import type { QuestSlotDto } from '@lb/contracts';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { exerciseName } from '@/features/training/catalog';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Bar, Icon, PressableScale, Text } from '@/ui';

const UNIT: Record<QuestSlotDto['unit'], string> = { reps: '', sec: 's', min: ' min' };

function Mini({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { c, radius } = useTheme();
  return (
    <PressableScale haptic="tap" onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: primary ? c.accent : c.surfaceRaised }}>
      <Text variant="callout" color={primary ? '#FFFFFF' : c.text}>{label}</Text>
    </PressableScale>
  );
}

/** One quest slot: progress + fast controls (+1/+5/Done for reps, a hold timer for seconds). */
export function SlotRow({
  slot,
  done,
  color,
  locked,
  onSet,
}: {
  slot: QuestSlotDto;
  done: number;
  color: string;
  locked?: boolean;
  onSet: (value: number) => void;
}) {
  const { c, spacing } = useTheme();
  const complete = done >= slot.target;
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(0);
  const name = exerciseName(slot.exerciseId);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - start.current) / 1000);
      setElapsed(s);
      if (done + s === slot.target) haptics.success();
    }, 250);
    return () => clearInterval(id);
  }, [running, done, slot.target]);

  return (
    <View style={{ gap: spacing[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Icon name={complete ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={complete ? c.success : c.textMuted} />
        <Text variant="callout" style={{ flex: 1 }}>{name}</Text>
        <Text variant="callout" dim>{`${Math.min(done + (running ? elapsed : 0), slot.target * 3)}${UNIT[slot.unit]} / ${slot.target}${UNIT[slot.unit]}`}</Text>
      </View>
      <Bar ratio={(done + (running ? elapsed : 0)) / slot.target} height={4} color={complete ? c.success : color} />
      {!complete && !locked ? (
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {slot.unit === 'reps' ? (
            <>
              <Mini label="+1" onPress={() => onSet(done + 1)} />
              <Mini label="+5" onPress={() => onSet(done + 5)} />
              <Mini label="+10" onPress={() => onSet(done + 10)} />
            </>
          ) : slot.unit === 'sec' ? (
            <Mini
              label={running ? `Stop (${elapsed}s)` : 'Start timer'}
              onPress={() => {
                if (running) {
                  setRunning(false);
                  onSet(done + elapsed);
                  setElapsed(0);
                } else {
                  start.current = Date.now();
                  setRunning(true);
                  haptics.heavy();
                }
              }}
            />
          ) : null}
          <Mini primary label="Done" onPress={() => onSet(slot.target)} />
        </View>
      ) : null}
    </View>
  );
}
