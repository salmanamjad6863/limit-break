/**
 * The animated 2D trainer (VISUALS.md §3.10): an original anime-style coach performing the
 * exercise from baked key frames. Runs on the UI thread (Reanimated + Skia); the JS thread only
 * picks the animation. Transparent background, so the live aura shows behind it.
 */
import { ANIMS, FPS, JOINTS, trainerAnimation, type Baked, type Prop } from '@lb/content';
import { Canvas, Circle, Group, Line, Oval, Path, RoundedRect, Skia, useClock, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';

type Pts = SharedValue<number[]>;
const J = Object.fromEntries(JOINTS.map((j, i) => [j, i])) as Record<(typeof JOINTS)[number], number>;

const C = {
  out: '#0B0B13', skin: '#F2CBAA', skinFar: '#C99C80', shorts: '#2B2E3D', shortsFar: '#22242F', shoe: '#EEEEF4', shoeFar: '#B9BAC6',
  hair: '#1B1E33', metal: '#C9CEDD', plate: '#454A62', plateRim: '#9BA2BC', pad: '#3B3F55', band: '#3DDC97',
};
/** world-unit stroke widths */
const W = { torso: 24, neck: 8, upper: 10, fore: 8.5, thigh: 14, shin: 11, foot: 7, outline: 4 };

const poly = (pts: number[][]) => {
  const b = Skia.PathBuilder.Make();
  pts.forEach(([x, y], i) => (i ? b.lineTo(x!, y!) : b.moveTo(x!, y!)));
  b.close();
  return b.detach();
};
const SIDE_HAIR = poly([[10, -2], [13, -7], [7, -8], [9, -14], [2, -12], [2, -19], [-4, -13], [-10, -17], [-10, -10], [-17, -9], [-12, -4], [-16, 1], [-11, 3], [-10, 8], [-6, 5], [-4, -2], [3, -5]]);
const FRONT_HAIR = poly([[-11, -1], [-13, -8], [-8, -9], [-9, -16], [-3, -12], [0, -19], [3, -12], [9, -16], [8, -9], [13, -8], [11, -1], [6, -6], [0, -4], [-6, -6]]);

export const hasTrainer = (exerciseId: string) => !!ANIMS[exerciseId];

export function TrainerFigure({
  exerciseId, width, height, playing = true, mirrored = false, accent = '#7C5CFF', speed = 1,
}: { exerciseId: string; width: number; height: number; playing?: boolean; mirrored?: boolean; accent?: string; speed?: number }) {
  const baked = useMemo(() => trainerAnimation(exerciseId), [exerciseId]);
  if (!baked || width <= 0 || height <= 0) return null;
  return <Figure key={exerciseId} baked={baked} width={width} height={height} playing={playing} mirrored={mirrored} accent={accent} speed={speed} />;
}

function Figure({ baked, width, height, playing, mirrored, accent, speed }: { baked: Baked; width: number; height: number; playing: boolean; mirrored: boolean; accent: string; speed: number }) {
  const reduce = useReducedMotion();
  const clock = useClock();
  const { data, stride, frames, view, bounds, props } = baked;
  const front = view === 'front';

  // fit world bounds into the box; ground at the bottom
  const pad = Math.min(width, height) * 0.06;
  const s = Math.min((width - 2 * pad) / (bounds.maxX - bounds.minX), (height - 2 * pad) / (bounds.maxY - bounds.minY));
  const ox = (width - (bounds.maxX - bounds.minX) * s) / 2 - bounds.minX * s;
  // centre vertically: standing moves fill the height anyway; floor moves don't float at the bottom
  const oy = height / 2 + ((bounds.maxY - bounds.minY) * s) / 2 + bounds.minY * s;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy - y * s;

  /** screen points for every joint (+ head angle last), interpolated between baked frames */
  const pts = useDerivedValue(() => {
    const t = reduce || !playing ? frames * 0.25 : ((clock.value / 1000) * FPS * speed) % frames;
    const f0 = Math.floor(t) % frames;
    const f1 = (f0 + 1) % frames;
    const a = t - Math.floor(t);
    const out: number[] = new Array(stride);
    for (let i = 0; i < stride - 1; i++) {
      const v = data[f0 * stride + i]! * (1 - a) + data[f1 * stride + i]! * a;
      out[i] = i % 2 === 0 ? ox + v * s : oy - v * s;
    }
    out[stride - 1] = data[f0 * stride + stride - 1]! * (1 - a) + data[f1 * stride + stride - 1]! * a;
    return out;
  });

  const far = !front;
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Group transform={mirrored ? [{ translateX: width }, { scaleX: -1 }] : []}>
        <Shadow pts={pts} s={s} groundY={Y(0)} />
        <StaticProps props={props} X={X} Y={Y} s={s} top={bounds.maxY} accent={accent} />
        {/* far side, body, head, then near side */}
        <Leg pts={pts} side="F" s={s} dim={far} />
        <Arm pts={pts} side="F" s={s} dim={far} accent={accent} />
        {front ? (
          <>
            <Seg pts={pts} a={J.hipN} b={J.hipF} w={14} color={C.shorts} s={s} />
            <Seg pts={pts} a={J.hip} b={J.shoulder} w={30} color={accent} s={s} />
            <Seg pts={pts} a={J.shoulderN} b={J.shoulderF} w={12} color={accent} s={s} />
          </>
        ) : (
          <Seg pts={pts} a={J.hip} b={J.shoulder} w={W.torso} color={accent} s={s} />
        )}
        <Seg pts={pts} a={J.shoulder} b={J.head} w={W.neck} color={C.skin} s={s} />
        <Head pts={pts} s={s} front={front} accent={accent} stride={stride} />
        <HandProps props={props} pts={pts} s={s} X={X} Y={Y} />
        <Leg pts={pts} side="N" s={s} dim={false} />
        <Arm pts={pts} side="N" s={s} dim={false} accent={accent} />
        <Dumbbells props={props} pts={pts} s={s} />
        {props.some((p) => p.kind === 'kettlebell') ? <Kettlebell pts={pts} s={s} /> : null}
      </Group>
    </Canvas>
  );
}

/** One limb segment: dark cel outline + fill, round caps. */
function Seg({ pts, a, b, w, color, s, opacity = 1, outline = true }: { pts: Pts; a: number; b: number; w: number; color: string; s: number; opacity?: number; outline?: boolean }) {
  const p1 = useDerivedValue(() => vec(pts.value[a * 2]!, pts.value[a * 2 + 1]!));
  const p2 = useDerivedValue(() => vec(pts.value[b * 2]!, pts.value[b * 2 + 1]!));
  return (
    <Group opacity={opacity}>
      {outline ? <Line p1={p1} p2={p2} strokeWidth={(w + W.outline) * s} color={C.out} strokeCap="round" style="stroke" /> : null}
      <Line p1={p1} p2={p2} strokeWidth={w * s} color={color} strokeCap="round" style="stroke" />
    </Group>
  );
}

function Leg({ pts, side, s, dim }: { pts: Pts; side: 'N' | 'F'; s: number; dim: boolean }) {
  const n = side === 'N';
  return (
    <>
      <Seg pts={pts} a={n ? J.hipN : J.hipF} b={n ? J.kneeN : J.kneeF} w={W.thigh} color={dim ? C.shortsFar : C.shorts} s={s} />
      <Seg pts={pts} a={n ? J.kneeN : J.kneeF} b={n ? J.ankleN : J.ankleF} w={W.shin} color={dim ? C.skinFar : C.skin} s={s} />
      <Seg pts={pts} a={n ? J.heelN : J.heelF} b={n ? J.toeN : J.toeF} w={W.foot} color={dim ? C.shoeFar : C.shoe} s={s} />
    </>
  );
}

function Arm({ pts, side, s, dim, accent }: { pts: Pts; side: 'N' | 'F'; s: number; dim: boolean; accent: string }) {
  const n = side === 'N';
  const sh = n ? J.shoulderN : J.shoulderF;
  const el = n ? J.elbowN : J.elbowF;
  const p1 = useDerivedValue(() => vec(pts.value[sh * 2]!, pts.value[sh * 2 + 1]!));
  // short sleeve, 45% down the upper arm
  const p2 = useDerivedValue(() => vec(
    pts.value[sh * 2]! + (pts.value[el * 2]! - pts.value[sh * 2]!) * 0.45,
    pts.value[sh * 2 + 1]! + (pts.value[el * 2 + 1]! - pts.value[sh * 2 + 1]!) * 0.45,
  ));
  return (
    <>
      <Seg pts={pts} a={sh} b={el} w={W.upper} color={dim ? C.skinFar : C.skin} s={s} />
      <Line p1={p1} p2={p2} strokeWidth={(W.upper + 2) * s} color={accent} opacity={dim ? 0.72 : 1} strokeCap="round" style="stroke" />
      <Seg pts={pts} a={el} b={n ? J.wristN : J.wristF} w={W.fore} color={dim ? C.skinFar : C.skin} s={s} />
    </>
  );
}

function Head({ pts, s, front, accent, stride }: { pts: Pts; s: number; front: boolean; accent: string; stride: number }) {
  const cx = useDerivedValue(() => pts.value[J.head * 2]!);
  const cy = useDerivedValue(() => pts.value[J.head * 2 + 1]!);
  const t = useDerivedValue(() => [
    { translateX: pts.value[J.head * 2]! }, { translateY: pts.value[J.head * 2 + 1]! },
    { rotate: front ? 0 : (pts.value[stride - 1]! * Math.PI) / 180 }, { scale: s },
  ]);
  return (
    <>
      <Circle cx={cx} cy={cy} r={(11 + W.outline / 2) * s} color={C.out} />
      <Circle cx={cx} cy={cy} r={11 * s} color={C.skin} />
      <Group transform={t}>
        <Path path={front ? FRONT_HAIR : SIDE_HAIR} color={C.out} style="stroke" strokeWidth={2.4} strokeJoin="round" />
        <Path path={front ? FRONT_HAIR : SIDE_HAIR} color={C.hair} />
        <Line p1={vec(front ? -10 : -9, -7)} p2={vec(front ? 10 : 9, front ? -7 : -6)} strokeWidth={2.6} color={accent} strokeCap="round" style="stroke" />
        {front ? (
          <>
            <Oval x={-5.4} y={-1.2} width={2.6} height={3.4} color={C.out} />
            <Oval x={2.8} y={-1.2} width={2.6} height={3.4} color={C.out} />
          </>
        ) : (
          <>
            <Oval x={5} y={-1.6} width={2.6} height={3.6} color={C.out} />
            <Circle cx={5.9} cy={-0.8} r={0.6} color="#FFFFFF" />
          </>
        )}
      </Group>
    </>
  );
}

function Shadow({ pts, s, groundY }: { pts: Pts; s: number; groundY: number }) {
  const x = useDerivedValue(() => pts.value[J.hip * 2]! - 36 * s);
  return <Oval x={x} y={groundY - 4 * s} width={72 * s} height={8 * s} color="rgba(0,0,0,0.35)" />;
}

/** Benches, boxes, walls, bars, cable/band anchors (static, world → screen). */
function StaticProps({ props, X, Y, s, top, accent }: { props: Prop[]; X: (x: number) => number; Y: (y: number) => number; s: number; top: number; accent: string }) {
  return (
    <>
      {props.map((p, i) => {
        if (p.kind === 'bench' || p.kind === 'box')
          return (
            <Group key={i}>
              <RoundedRect x={X(p.x)} y={Y(p.y + p.h)} width={p.w * s} height={p.h * s} r={3 * s} color={C.pad} />
              <RoundedRect x={X(p.x)} y={Y(p.y + p.h)} width={p.w * s} height={5 * s} r={2 * s} color={accent} opacity={0.85} />
            </Group>
          );
        if (p.kind === 'wall') return <RoundedRect key={i} x={X(p.x)} y={Y(top)} width={8 * s} height={top * s} r={2 * s} color="#232634" />;
        if (p.kind === 'bar')
          return (
            <Group key={i}>
              <Line p1={vec(X(p.x - 26), Y(p.y))} p2={vec(X(p.x + 26), Y(p.y))} strokeWidth={5 * s} color={C.metal} strokeCap="round" style="stroke" />
              <Circle cx={X(p.x - 26)} cy={Y(p.y)} r={4 * s} color={C.plateRim} />
              <Circle cx={X(p.x + 26)} cy={Y(p.y)} r={4 * s} color={C.plateRim} />
            </Group>
          );
        if ((p.kind === 'cable' || p.kind === 'band') && p.from) return <Circle key={i} cx={X(p.from[0])} cy={Y(p.from[1])} r={4 * s} color={p.kind === 'band' ? C.band : C.metal} />;
        return null;
      })}
    </>
  );
}

/** Barbell / kettlebell at the prop anchor, cables and bands to the hands. */
function HandProps({ props, pts, s, X, Y }: { props: Prop[]; pts: Pts; s: number; X: (x: number) => number; Y: (y: number) => number }) {
  return (
    <>
      {props.map((p, i) => {
        if (p.kind === 'barbell') return <Plate key={i} pts={pts} s={s} />;
        if (p.kind === 'cable' || p.kind === 'band')
          return <Cord key={i} pts={pts} s={s} from={p.from ? vec(X(p.from[0]), Y(p.from[1])) : null} color={p.kind === 'band' ? C.band : C.metal} />;
        return null;
      })}
    </>
  );
}

function Plate({ pts, s }: { pts: Pts; s: number }) {
  const cx = useDerivedValue(() => pts.value[J.prop * 2]!);
  const cy = useDerivedValue(() => pts.value[J.prop * 2 + 1]!);
  return (
    <>
      <Circle cx={cx} cy={cy} r={22 * s} color={C.plate} />
      <Circle cx={cx} cy={cy} r={21 * s} color={C.plateRim} style="stroke" strokeWidth={3 * s} />
      <Circle cx={cx} cy={cy} r={4 * s} color={C.metal} />
    </>
  );
}

function Kettlebell({ pts, s }: { pts: Pts; s: number }) {
  const cx = useDerivedValue(() => pts.value[J.prop * 2]!);
  const cy = useDerivedValue(() => pts.value[J.prop * 2 + 1]! + 13 * s);
  const hy = useDerivedValue(() => pts.value[J.prop * 2 + 1]!);
  return (
    <>
      <Circle cx={cx} cy={hy} r={5.5 * s} color={C.plateRim} style="stroke" strokeWidth={3 * s} />
      <Circle cx={cx} cy={cy} r={11.5 * s} color={C.out} />
      <Circle cx={cx} cy={cy} r={10 * s} color={C.plateRim} />
    </>
  );
}

function Cord({ pts, s, from, color }: { pts: Pts; s: number; from: { x: number; y: number } | null; color: string }) {
  const a = useDerivedValue(() => (from ? vec(from.x, from.y) : vec(pts.value[J.wristN * 2]!, pts.value[J.wristN * 2 + 1]!)));
  const b = useDerivedValue(() => from
    ? vec((pts.value[J.wristN * 2]! + pts.value[J.wristF * 2]!) / 2, (pts.value[J.wristN * 2 + 1]! + pts.value[J.wristF * 2 + 1]!) / 2)
    : vec(pts.value[J.wristF * 2]!, pts.value[J.wristF * 2 + 1]!));
  return <Line p1={a} p2={b} strokeWidth={2.4 * s} color={color} strokeCap="round" style="stroke" />;
}

function Dumbbells({ props, pts, s }: { props: Prop[]; pts: Pts; s: number }) {
  const db = props.find((p) => p.kind === 'dumbbell') as Extract<Prop, { kind: 'dumbbell' }> | undefined;
  if (!db) return null;
  return (
    <>
      <Dumbbell pts={pts} j={J.wristN} s={s} />
      {db.at === 'hands' ? <Dumbbell pts={pts} j={J.wristF} s={s} /> : null}
    </>
  );
}

function Dumbbell({ pts, j, s }: { pts: Pts; j: number; s: number }) {
  const l = useDerivedValue(() => vec(pts.value[j * 2]! - 8 * s, pts.value[j * 2 + 1]!));
  const r = useDerivedValue(() => vec(pts.value[j * 2]! + 8 * s, pts.value[j * 2 + 1]!));
  const lx = useDerivedValue(() => pts.value[j * 2]! - 9 * s);
  const rx = useDerivedValue(() => pts.value[j * 2]! + 9 * s);
  const y = useDerivedValue(() => pts.value[j * 2 + 1]!);
  return (
    <>
      <Line p1={l} p2={r} strokeWidth={3.5 * s} color={C.metal} style="stroke" strokeCap="round" />
      <Circle cx={lx} cy={y} r={5.5 * s} color={C.plate} />
      <Circle cx={rx} cy={y} r={5.5 * s} color={C.plate} />
    </>
  );
}
