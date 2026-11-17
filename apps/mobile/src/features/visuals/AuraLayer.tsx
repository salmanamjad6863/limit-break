import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { rankColor } from '@lb/tokens';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Easing, useDerivedValue, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useMe } from '@/features/progression/api';

/** Effort states (VISUALS.md §3.4). */
export type AuraState = 'idle' | 'charging' | 'power' | 'surge' | 'burst' | 'embers' | 'awakening';

/** power, flame speed, sparks, ground ring */
const LEVELS: Record<AuraState, [number, number, number, number]> = {
  idle: [0.28, 0.5, 0.35, 0.18],
  charging: [0.45, 0.8, 0.55, 0.95],
  power: [0.66, 1.0, 0.7, 0.4],
  surge: [1.0, 1.8, 1.0, 0.65],
  burst: [0.9, 1.4, 1.0, 0.8],
  embers: [0.14, 0.35, 0.55, 0.06],
  awakening: [1.0, 1.4, 1.0, 1.0],
};

/**
 * Flame aura: layered fbm noise rising around a body-shaped core, hashed sparks drifting up,
 * an elliptical ground ring and a one-shot flash. Output is premultiplied and fades to
 * transparent at the edges so it sits *behind* a transparent trainer clip.
 */
const SKSL = `
uniform float2 res;
uniform float t;
uniform float3 col;
uniform float power;
uniform float speed;
uniform float sparks;
uniform float ring;
uniform float flash;

float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p); float2 f = fract(p); float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1, 0)), u.x), mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), u.x), u.y);
}
float fbm(float2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

half4 main(float2 xy) {
  float2 uv = xy / res;
  float tt = t * speed;
  // body-shaped core: a tall ellipse slightly below centre
  float2 c = float2((uv.x - 0.5) * 2.2, (uv.y - 0.58) * 1.15);
  float body = length(c);
  // turbulence scrolls upward; flames stretch higher with power
  float n1 = fbm(float2(uv.x * 3.6, uv.y * 2.6 + tt * 1.8));
  float n2 = fbm(float2(uv.x * 7.5 + 3.1, uv.y * 4.5 + tt * 2.8));
  float above = clamp((0.62 - uv.y) * 1.6, 0.0, 1.0);          // region above the shoulders
  float edge = 0.48 + 0.30 * power;
  float d = body + (n1 - 0.5) * (0.45 + 0.4 * power) - above * n2 * (0.25 + 0.55 * power);
  float flame = smoothstep(edge, edge * 0.15, d);
  // licking tongues rising off the silhouette
  float tongues = smoothstep(0.5, 0.95, n2) * smoothstep(edge + 0.35, 0.05, body) * (0.35 + 0.65 * power);
  float rim = smoothstep(edge * 0.55, edge * 0.85, d) * smoothstep(edge * 1.05, edge * 0.85, d);
  // wide, soft halo so it reads as light *behind* the trainer, not a solid pillar
  float halo = smoothstep(edge + 0.3, 0.0, body) * (0.08 + 0.1 * power);
  float glow = halo + flame * (0.1 + 0.18 * power) + tongues * 0.4 + rim * 0.35 * power;

  // sparks rising from the body
  float2 g = float2(uv.x * 13.0, uv.y * 9.0 + tt * 2.4);
  float2 cell = floor(g);
  float h = hash(cell);
  float2 f = fract(g) - 0.5 - (float2(hash(cell + 7.0), hash(cell + 3.0)) - 0.5) * 0.6;
  float spark = step(0.82, h) * smoothstep(0.1, 0.0, length(f)) * smoothstep(1.0, 0.2, uv.y) * smoothstep(0.7, 0.15, abs(uv.x - 0.5));

  // ground ring under the feet
  float rr = length(float2((uv.x - 0.5) * 1.0, (uv.y - 0.9) * 4.2));
  float ringR = 0.30 + 0.03 * sin(t * 2.0);
  float ringGlow = smoothstep(0.045, 0.0, abs(rr - ringR)) + 0.3 * smoothstep(ringR, 0.0, rr);

  float fl = flash * smoothstep(1.0, 0.0, body);

  float a = clamp(glow + spark * sparks * 0.7 + ringGlow * ring * 0.55 + fl * 0.6, 0.0, 1.0);
  // keep the colour saturated; only the hottest core and the flash go toward white
  float core = clamp(pow(flame, 6.0) * power * 0.2 + fl * 0.45, 0.0, 1.0);
  float3 rgb = mix(col * (0.85 + 0.35 * flame), float3(1.0), core);
  float vig = smoothstep(0.0, 0.1, uv.x) * smoothstep(1.0, 0.9, uv.x) * smoothstep(0.0, 0.22, uv.y);
  // opacity cap: the aura frames the body, never washes over it (VISUALS.md §3.4)
  a = min(a * vig, 0.4);
  return half4(half3(clamp(rgb, 0.0, 1.0) * a), half(a));
}`;

const effect = Skia.RuntimeEffect.Make(SKSL);

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Aura palette: the rank colours, except E, whose badge grey reads as smoke, so it glows spirit-blue. */
const AURA = { ...rankColor, E: '#6FA8FF' } as const;

/** The hunter's aura colour by rank (E spirit-blue → S gold). */
export function useAuraColor(): string {
  const { data } = useMe();
  return AURA[(data?.state?.rank ?? 'E') as keyof typeof AURA];
}

/**
 * Live anime aura behind the trainer (VISUALS.md §3.4). Reacts to effort state, eases between
 * states, flashes on burst/awakening. Reduce Motion → a static glow. Throttled to 30 fps.
 */
export function AuraLayer({ state = 'idle', color, intensity = 1 }: { state?: AuraState; color?: string; intensity?: number }) {
  const reduce = useReducedMotion();
  const rank = useAuraColor();
  const hex = state === 'awakening' ? AURA.S : color ?? rank;
  const clock = useClock();
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const [p0, s0, k0, r0] = LEVELS[state];
  const power = useSharedValue(p0);
  const speed = useSharedValue(s0);
  const sparks = useSharedValue(k0);
  const ring = useSharedValue(r0);
  const flash = useSharedValue(0);

  useEffect(() => {
    const [p, s, k, r] = LEVELS[state];
    const cfg = { duration: state === 'surge' || state === 'burst' ? 250 : 600, easing: Easing.out(Easing.cubic) };
    power.set(withTiming(p * intensity, cfg));
    speed.set(withTiming(s, cfg));
    sparks.set(withTiming(k, cfg));
    ring.set(withTiming(r, cfg));
    if (state === 'burst' || state === 'awakening') {
      flash.set(withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: state === 'awakening' ? 1400 : 600 })));
    }
  }, [state, intensity]); // eslint-disable-line react-hooks/exhaustive-deps

  const rgb = hexToRgb(hex);
  const uniforms = useDerivedValue(() => ({
    res: [Math.max(1, w.get()), Math.max(1, h.get())],
    // 30 fps steps: the value only changes 30×/s, so Skia redraws at most that often
    t: reduce ? 1.3 : Math.floor(clock.get() / 33.3) / 30,
    col: rgb,
    power: power.get(),
    speed: speed.get(),
    sparks: sparks.get(),
    ring: ring.get(),
    flash: flash.get(),
  }));

  if (!effect) return null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        w.set(e.nativeEvent.layout.width);
        h.set(e.nativeEvent.layout.height);
      }}>
      <Canvas style={{ flex: 1 }}>
        <Fill>
          <Shader source={effect} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </View>
  );
}
