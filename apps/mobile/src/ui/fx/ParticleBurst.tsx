import { BlurMask, Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

/** One-shot radial burst + shockwave ring. Re-fires whenever `trigger` changes. */
export function ParticleBurst({
  width,
  height,
  color,
  trigger,
  count = 42,
}: {
  width: number;
  height: number;
  color: string;
  trigger: number;
  count?: number;
}) {
  const p = useSharedValue(0);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) * 0.55;

  useEffect(() => {
    p.set(0);
    p.set(withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }));
  }, [trigger, p]);

  const sparks = useDerivedValue(() => {
    const path = Skia.PathBuilder.Make();
    const prog = p.get();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (i % 3) * 0.13;
      const dist = maxR * prog * (0.55 + ((i * 37) % 45) / 100);
      const rad = Math.max(0, 3.2 * (1 - prog)) + 0.4;
      path.addCircle(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, rad);
    }
    return path.detach();
  });
  const sparkOpacity = useDerivedValue(() => 1 - p.get());
  const ringR = useDerivedValue(() => maxR * 1.1 * p.get());
  const ringOpacity = useDerivedValue(() => 0.9 * (1 - p.get()));
  const ringWidth = useDerivedValue(() => 1 + 10 * (1 - p.get()));

  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height }} pointerEvents="none">
      <Circle cx={cx} cy={cy} r={ringR} style="stroke" strokeWidth={ringWidth} color={color} opacity={ringOpacity}>
        <BlurMask blur={6} style="solid" />
      </Circle>
      <Path path={sparks} color={color} opacity={sparkOpacity}>
        <BlurMask blur={2} style="solid" />
      </Path>
    </Canvas>
  );
}
