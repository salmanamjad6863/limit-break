import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Easing, useDerivedValue, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

/** Activity-style progress ring (Skia). Children render centred inside. */
export function Ring({
  ratio,
  size = 72,
  stroke = 8,
  color,
  track = 'rgba(255,255,255,0.07)',
  delayMs = 0,
  children,
}: {
  ratio: number;
  size?: number;
  stroke?: number;
  color: string;
  track?: string;
  delayMs?: number;
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const target = Math.min(1, Math.max(0, ratio));
  const p = useSharedValue(reduce ? target : 0);
  useEffect(() => {
    p.set(reduce ? target : withDelay(delayMs, withTiming(target, { duration: 1000, easing: Easing.out(Easing.cubic) })));
  }, [target, delayMs, reduce, p]);

  const circle = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    const r = (size - stroke) / 2;
    b.addArc({ x: stroke / 2, y: stroke / 2, width: r * 2, height: r * 2 }, -90, 359.99);
    return b.detach();
  }, [size, stroke]);
  const end = useDerivedValue(() => Math.max(0.001, p.get()));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Canvas style={{ position: 'absolute', width: size, height: size }}>
        <Path path={circle} style="stroke" strokeWidth={stroke} color={track} strokeCap="round" />
        {target > 0 ? <Path path={circle} style="stroke" strokeWidth={stroke} color={color} strokeCap="round" start={0} end={end} /> : null}
      </Canvas>
      {children}
    </View>
  );
}
