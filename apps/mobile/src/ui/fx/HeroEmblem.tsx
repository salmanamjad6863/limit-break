import {
  BlurMask,
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Path,
  RadialGradient,
  Skia,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';
import { Text } from '../Text';

/**
 * Animated hero sigil — a stand-in for the VRoid hero art (ARCHITECTURE.md §4.2):
 * pulsing aura, counter-rotating rune rings, a hexagram core, rising embers and the hero's initial.
 */
export function HeroEmblem({ size = 220, color, initial }: { size?: number; color: string; initial: string }) {
  const reduce = useReducedMotion();
  const clock = useClock();
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;

  const hexagram = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    const tri = (offset: number) => {
      for (let i = 0; i < 3; i++) {
        const a = offset + (i * 2 * Math.PI) / 3;
        const x = cx + r * 0.62 * Math.cos(a);
        const y = cy + r * 0.62 * Math.sin(a);
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      p.close();
    };
    tri(-Math.PI / 2);
    tri(Math.PI / 2);
    return p.detach();
  }, [cx, cy, r]);

  const t = useDerivedValue(() => (reduce ? 0 : clock.get() / 1000));
  const spinA = useDerivedValue(() => [{ rotate: t.get() * 0.35 }]);
  const spinB = useDerivedValue(() => [{ rotate: -t.get() * 0.22 }]);
  const pulse = useDerivedValue(() => r * (1.28 + 0.06 * Math.sin(t.get() * 1.6)));
  const coreGlow = useDerivedValue(() => 0.55 + 0.25 * Math.sin(t.get() * 2.1));

  // 18 embers drifting upward, deterministic so nothing allocates per frame except one path
  const embers = useDerivedValue(() => {
    const p = Skia.PathBuilder.Make();
    for (let i = 0; i < 18; i++) {
      const seed = i * 97.13;
      const speed = 14 + (i % 5) * 6;
      const life = (t.get() * speed + seed * 3) % (size * 0.9);
      const x = cx + Math.sin(seed + t.get() * 0.8) * r * (0.4 + (i % 4) * 0.25);
      const y = size * 0.92 - life;
      const rad = 1 + (i % 3) * 0.7;
      p.addCircle(x, y, rad);
    }
    return p.detach();
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Canvas style={{ position: 'absolute', width: size, height: size }}>
        <Circle cx={cx} cy={cy} r={pulse}>
          <RadialGradient c={vec(cx, cy)} r={r * 1.4} colors={[`${color}66`, `${color}10`, `${color}00`]} />
        </Circle>
        <Group transform={spinA} origin={vec(cx, cy)}>
          <Circle cx={cx} cy={cy} r={r} style="stroke" strokeWidth={1.5} color={`${color}CC`}>
            <DashPathEffect intervals={[10, 6, 2, 6]} />
          </Circle>
          <Circle cx={cx} cy={cy} r={r * 1.12} style="stroke" strokeWidth={1} color={`${color}55`}>
            <DashPathEffect intervals={[2, 9]} />
          </Circle>
        </Group>
        <Group transform={spinB} origin={vec(cx, cy)}>
          <Path path={hexagram} style="stroke" strokeWidth={1.5} color={`${color}EE`}>
            <BlurMask blur={2} style="solid" />
          </Path>
          <Circle cx={cx} cy={cy} r={r * 0.82} style="stroke" strokeWidth={1} color={`${color}88`}>
            <DashPathEffect intervals={[22, 8]} />
          </Circle>
        </Group>
        <Circle cx={cx} cy={cy} r={r * 0.42} color={color} opacity={coreGlow}>
          <BlurMask blur={18} style="normal" />
        </Circle>
        <Path path={embers} color={`${color}`} opacity={0.85}>
          <BlurMask blur={1.5} style="solid" />
        </Path>
      </Canvas>
      {initial ? (
        <Text variant="display" style={{ fontSize: size * 0.22, lineHeight: size * 0.26, textShadowColor: color, textShadowRadius: 18 }}>
          {initial}
        </Text>
      ) : null}
    </View>
  );
}

