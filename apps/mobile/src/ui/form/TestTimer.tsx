import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Button } from '../hud/Button';
import { Text } from '../Text';

/**
 * Assessment helper. countdown: 60 s timer for the squat test.
 * stopwatch: start/stop for the plank hold — reports elapsed seconds on stop.
 */
export function TestTimer({
  mode,
  onResult,
}: {
  mode: 'countdown' | 'stopwatch';
  onResult?: (seconds: number) => void;
}) {
  const { c, spacing } = useTheme();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - started.current) / 1000);
      setElapsed(s);
      if (mode === 'countdown' && s >= 60) {
        setRunning(false);
        haptics.success();
      }
    }, 200);
    return () => clearInterval(id);
  }, [running, mode]);

  const shown = mode === 'countdown' ? Math.max(0, 60 - elapsed) : elapsed;
  const toggle = () => {
    if (running) {
      setRunning(false);
      if (mode === 'stopwatch') onResult?.(elapsed);
      haptics.press();
    } else {
      started.current = Date.now();
      setElapsed(0);
      setRunning(true);
      haptics.heavy();
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
      <Text variant="stat" color={running ? c.accentGlow : c.textDim} style={{ minWidth: 64 }}>
        {`${shown}s`}
      </Text>
      <View style={{ flex: 1 }}>
        <Button
          variant={running ? 'primary' : 'ghost'}
          label={running ? (mode === 'stopwatch' ? 'Stop & record' : 'Stop') : mode === 'countdown' ? 'Start 60 s' : 'Start hold'}
          onPress={toggle}
        />
      </View>
    </View>
  );
}
