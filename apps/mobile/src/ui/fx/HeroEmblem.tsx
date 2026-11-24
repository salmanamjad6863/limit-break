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
export type AuraStyle = 'pulse' | 'orbit' | 'flare' | 'storm';

export function HeroEmblem({
  size = 220, color, initial, aura,
}: {
  size?: number;
  color: string;
  initial: string;
  /** equipped aura cosmetic: its colours tint the glow, orbs, rays or lightning; the runes keep the hero's colour */
  aura?: { colors?: readonly [string, string] | null; style?: AuraStyle | null } | null;
}) {
  const reduce = useReducedMotion();
  const auraA = aura?.colors?.[0] ?? color;
  const auraB = aura?.colors?.[1] ?? color;
  const auraStyle = aura?.style ?? 'pulse';
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

  // orbit: five orbs circling just outside the runes
  const orbs = useDerivedValue(() => {
    const p = Skia.PathBuilder.Make();
    if (auraStyle !== 'orbit') return p.detach();
    for (let i = 0; i < 5; i++) {
      const a = t.get() * 0.9 + (i * 2 * Math.PI) / 5;
      const rr = r * (1.22 + 0.04 * Math.sin(t.get() * 2 + i));
      p.addCircle(cx + rr * Math.cos(a), cy + rr * Math.sin(a), size * (0.012 + (i % 2) * 0.006));
    }
    return p.detach();
  });
  // flare: twelve light rays turning slowly
  const rays = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const w = 0.07;
      p.moveTo(cx + r * 0.9 * Math.cos(a - w), cy + r * 0.9 * Math.sin(a - w));
      p.lineTo(cx + r * (i % 2 ? 1.38 : 1.55) * Math.cos(a), cy + r * (i % 2 ? 1.38 : 1.55) * Math.sin(a));
      p.lineTo(cx + r * 0.9 * Math.cos(a + w), cy + r * 0.9 * Math.sin(a + w));
      p.close();
    }
    return p.detach();
  }, [cx, cy, r]);
  const spinRays = useDerivedValue(() => [{ rotate: t.get() * 0.12 }]);
  // storm: jagged arcs that re-strike several times a second
  const bolts = useDerivedValue(() => {
    const p = Skia.PathBuilder.Make();
    if (auraStyle !== 'storm') return p.detach();
    const strike = Math.floor(t.get() * 7);
    for (let k = 0; k < 3; k++) {
      const seed = strike * 3 + k;
      const start = ((seed * 2.399) % (Math.PI * 2));
      for (let j = 0; j <= 6; j++) {
        const a = start + j * 0.09;
        const jitter = Math.sin(seed * 12.9898 + j * 78.233) * 43758.5453;
        const rr = r * (1.2 + 0.12 * (jitter - Math.floor(jitter) - 0.5));
        const x = cx + rr * Math.cos(a);
        const y = cy + rr * Math.sin(a);
        if (j === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
    }
    return p.detach();
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Canvas style={{ position: 'absolute', width: size, height: size }}>
        <Circle cx={cx} cy={cy} r={pulse}>
          <RadialGradient c={vec(cx, cy)} r={r * 1.4} colors={[`${auraA}77`, `${auraB}22`, `${auraB}00`]} />
        </Circle>
        {auraStyle === 'flare' ? (
          <Group transform={spinRays} origin={vec(cx, cy)} opacity={0.5}>
            <Path path={rays}>
              <RadialGradient c={vec(cx, cy)} r={r * 1.55} colors={[`${auraA}CC`, `${auraB}00`]} />
            </Path>
          </Group>
        ) : null}
        {auraStyle === 'orbit' ? (
          <Path path={orbs} color={auraA}>
            <BlurMask blur={2.5} style="solid" />
          </Path>
        ) : null}
        {auraStyle === 'storm' ? (
          <Path path={bolts} style="stroke" strokeWidth={1.4} strokeJoin="round" color={auraA}>
            <BlurMask blur={3} style="solid" />
          </Path>
        ) : null}
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
        <Path path={embers} color={auraA} opacity={0.85}>
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

