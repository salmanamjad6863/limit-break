/**
 * Hunter portrait compositor (docs/AVATAR.md).
 * 2D portraits + noticeable live motion (breathe, ken-burns, aura pulse). Reduce Motion respected.
 */
import type { AvatarLoadoutDto, CosmeticDto } from '@lb/contracts';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  RoundedRect,
  vec,
  LinearGradient,
} from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { HeroEmblem } from '@/ui/fx';
import { AURA_OVERLAYS, DEFAULT_PORTRAIT, OUTFIT_PORTRAITS } from './assets';

type Layer = Pick<CosmeticDto, 'id' | 'slot' | 'tint' | 'shape'>;

const ORDER: Array<keyof AvatarLoadoutDto> = ['aura', 'body', 'outfit', 'hair', 'accessory', 'prop', 'frame'];

export function HunterAvatar({
  size = 120,
  loadout,
  catalog,
  accent,
  initial,
}: {
  size?: number;
  loadout?: AvatarLoadoutDto | null;
  catalog?: Layer[] | null;
  accent: string;
  initial: string;
}) {
  const reduce = useReducedMotion();
  const byId = useMemo(() => new Map((catalog ?? []).map((c) => [c.id, c])), [catalog]);
  const layers = useMemo(() => {
    if (!loadout) return [];
    return ORDER.map((slot) => {
      const id = loadout[slot];
      return id ? byId.get(id) ?? null : null;
    }).filter(Boolean) as Layer[];
  }, [loadout, byId]);

  const outfitId = loadout?.outfit ?? null;
  const auraId = loadout?.aura ?? null;
  const portrait = (outfitId && OUTFIT_PORTRAITS[outfitId]) || (loadout ? DEFAULT_PORTRAIT : null);
  const aura = auraId ? AURA_OVERLAYS[auraId] : undefined;

  const breath = useSharedValue(1);
  const pan = useSharedValue(0);
  const auraPulse = useSharedValue(0.75);
  const auraSpin = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      breath.value = 1;
      pan.value = 0;
      auraPulse.value = 0.75;
      auraSpin.value = 0;
      return;
    }
    breath.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    pan.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    auraPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.55, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    auraSpin.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1, false);
  }, [reduce, breath, pan, auraPulse, auraSpin]);

  const portraitStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: breath.value },
      { translateX: (pan.value - 0.5) * size * 0.06 },
      { translateY: (0.5 - pan.value) * size * 0.04 },
    ],
  }));
  const auraStyle = useAnimatedStyle(() => ({
    opacity: auraPulse.value,
    transform: [
      { scale: 1.05 + auraPulse.value * 0.12 },
      { rotate: `${auraSpin.value * 360}deg` },
    ],
  }));

  if (!loadout) {
    return <HeroEmblem size={size} color={accent} initial={initial} />;
  }

  if (portrait) {
    const frame = loadout.frame ? byId.get(loadout.frame) : null;
    // Portrait-only here. Onboarding hero sigil stays on Home/Profile via HeroEmblem — don't nest them.
    return (
      <View style={{ width: size, height: size, borderRadius: size * 0.18, overflow: 'hidden', backgroundColor: '#0B0F1A' }}>
        {aura ? (
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: size * 1.35,
                height: size * 1.35,
                left: -size * 0.175,
                top: -size * 0.15,
              },
              auraStyle,
            ]}
          >
            <Image source={aura} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          </Animated.View>
        ) : null}
        <Animated.View style={[{ width: size * 1.12, height: size * 1.12, marginLeft: -size * 0.06, marginTop: -size * 0.04 }, portraitStyle]}>
          <Image source={portrait} style={{ width: '100%', height: '100%' }} contentFit="cover" contentPosition="top" />
        </Animated.View>
        {frame ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              inset: 0,
              borderWidth: Math.max(2, size * 0.03),
              borderColor: frame.tint,
              borderRadius: size * 0.18,
            }}
          />
        ) : null}
      </View>
    );
  }



  if (layers.length === 0) {
    return <HeroEmblem size={size} color={accent} initial={initial} />;
  }

  const cx = size / 2;
  const cy = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        {layers.map((L) => {
          const tint = L.tint;
          if (L.shape === 'aura') {
            return (
              <Circle key={L.id} cx={cx} cy={cy} r={size * 0.46} color={tint} opacity={0.35}>
                <BlurMask blur={size * 0.12} style="normal" />
              </Circle>
            );
          }
          if (L.shape === 'frame') {
            return (
              <Circle key={L.id} cx={cx} cy={cy} r={size * 0.48} style="stroke" strokeWidth={size * 0.035} color={tint} opacity={0.9} />
            );
          }
          if (L.shape === 'body') {
            return (
              <Group key={L.id}>
                <Circle cx={cx} cy={cy - size * 0.18} r={size * 0.14} color={tint} />
                <RoundedRect x={cx - size * 0.16} y={cy - size * 0.06} width={size * 0.32} height={size * 0.42} r={size * 0.08} color={tint} />
              </Group>
            );
          }
          if (L.shape === 'outfit') {
            return (
              <RoundedRect key={L.id} x={cx - size * 0.17} y={cy - size * 0.04} width={size * 0.34} height={size * 0.36} r={size * 0.06} color={tint}>
                <LinearGradient start={vec(cx, cy - size * 0.1)} end={vec(cx, cy + size * 0.3)} colors={[`${tint}FF`, `${tint}AA`]} />
              </RoundedRect>
            );
          }
          if (L.shape === 'hair') {
            return (
              <Group key={L.id}>
                <Circle cx={cx} cy={cy - size * 0.22} r={size * 0.16} color={tint} />
                <RoundedRect x={cx - size * 0.18} y={cy - size * 0.28} width={size * 0.36} height={size * 0.14} r={size * 0.05} color={tint} />
              </Group>
            );
          }
          if (L.shape === 'accessory') {
            return (
              <RoundedRect key={L.id} x={cx - size * 0.14} y={cy - size * 0.12} width={size * 0.28} height={size * 0.05} r={size * 0.02} color={tint} />
            );
          }
          if (L.shape === 'prop') {
            return (
              <RoundedRect key={L.id} x={cx + size * 0.14} y={cy - size * 0.02} width={size * 0.06} height={size * 0.32} r={size * 0.02} color={tint} />
            );
          }
          return null;
        })}
      </Canvas>
    </View>
  );
}
