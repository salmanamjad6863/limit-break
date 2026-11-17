/**
 * 2D trainer rig (VISUALS.md §3.10): a jointed skeleton posed by key frames, baked to joint
 * positions at 30 fps so the renderer only interpolates numbers on the UI thread.
 *
 * World units: standing height ≈ 180, ground at y = 0, y points UP, the figure faces +x.
 * Limb angles are WORLD degrees measured from straight down, positive = forward (side view)
 * or outward (front view). Torso/head lean: degrees from straight up, positive = forward.
 */

export const SEG = { torso: 54, neck: 7, headR: 11, upperArm: 31, forearm: 28, thigh: 45, shin: 43, foot: 15, heel: 4, ankleH: 6 } as const;
const FRONT = { shoulderHalf: 17, hipHalf: 9 } as const;

export type Vec = readonly [number, number];
/** FK: [upper, lower] world angles. IK: end target (wrist/ankle) + which way the middle joint bends. */
export type Limb = { a: readonly [number, number] } | { ik: Vec; bend?: 1 | -1 };

export interface Pose {
  hip: Vec;
  torso: number;
  head?: number;
  armN: Limb;
  armF?: Limb;
  legN: Limb;
  legF?: Limb;
  /** foot angle from horizontal-forward (+ = toes up, −60 = up on the toes) */
  footN?: number;
  footF?: number;
  /** whole-figure rotation (deg, + = counter-clockwise) about `tiltAbout` — for lying/side-on poses */
  tilt?: number;
  tiltAbout?: Vec;
}

export type Ease = 'inOut' | 'in' | 'out' | 'linear';
export interface Key {
  p: Pose;
  /** seconds to arrive at this pose from the previous key */
  dur: number;
  /** seconds to hold after arriving */
  hold?: number;
  ease?: Ease;
}

export type PropAnchor = 'hands' | 'handN' | 'back' | 'frontRack' | 'hip';
export type Prop =
  | { kind: 'barbell'; at: PropAnchor }
  | { kind: 'dumbbell'; at: 'hands' | 'handN' }
  | { kind: 'kettlebell'; at: 'hands' }
  | { kind: 'bench'; x: number; y: number; w: number; h: number }
  | { kind: 'box'; x: number; y: number; w: number; h: number }
  | { kind: 'wall'; x: number }
  | { kind: 'bar'; x: number; y: number }
  | { kind: 'cable'; from: Vec }
  /** band anchored at `from`, or stretched between the hands when omitted */
  | { kind: 'band'; from?: Vec };

export interface Anim {
  view: 'side' | 'front';
  keys: Key[];
  props?: Prop[];
}

/* ---------------- math ---------------- */
const D = Math.PI / 180;
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
const len = (a: Vec) => Math.hypot(a[0], a[1]);
/** unit vector for a world angle measured from straight down (+ forward) */
const downDir = (deg: number): Vec => [Math.sin(deg * D), -Math.cos(deg * D)];
/** angle (from straight down, + forward) of vector v */
const angleOf = (v: Vec) => Math.atan2(v[0], -v[1]) / D;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;
const ease = (e: Ease | undefined, t: number) =>
  e === 'linear' ? t : e === 'in' ? t * t : e === 'out' ? 1 - (1 - t) * (1 - t) : t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);

/** Two-bone IK. bend +1 puts the middle joint on the left of root→target (forward for a downward limb). */
export function ik2(root: Vec, target: Vec, a: number, b: number, bend: 1 | -1): { mid: Vec; end: Vec; reachable: boolean } {
  const d: Vec = [target[0] - root[0], target[1] - root[1]];
  const raw = len(d) || 1e-6;
  const dist = Math.min(Math.max(raw, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const u = scale(d, 1 / raw);
  const p: Vec = [-u[1], u[0]];
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const mid = add(root, add(scale(u, a * cosA), scale(p, a * sinA * bend)));
  const end = add(root, scale(u, dist));
  return { mid, end, reachable: raw <= a + b + 0.5 };
}

/* ---------------- solving one pose ---------------- */
export const JOINTS = [
  'hip', 'shoulder', 'head', 'elbowN', 'wristN', 'elbowF', 'wristF', 'kneeN', 'ankleN', 'heelN', 'toeN',
  'kneeF', 'ankleF', 'heelF', 'toeF', 'hipN', 'hipF', 'shoulderN', 'shoulderF', 'prop',
] as const;
export type Joint = (typeof JOINTS)[number];
export type Solved = Record<Joint, Vec> & { headAngle: number };

/** Normalised pose: every limb as angles + end point, so keys can be interpolated. */
interface Norm {
  hip: Vec; torso: number; head: number; footN: number; footF: number; tilt: number; tiltAbout: Vec;
  limbs: Record<'armN' | 'armF' | 'legN' | 'legF', { ang: [number, number]; end: Vec; ik: boolean; bend: 1 | -1 }>;
}

function roots(view: Anim['view'], hip: Vec, torso: number) {
  const shoulder: Vec = add(hip, [Math.sin(torso * D) * SEG.torso, Math.cos(torso * D) * SEG.torso]);
  if (view === 'side') return { shoulder, shoulderN: shoulder, shoulderF: shoulder, hipN: hip, hipF: hip };
  return {
    shoulder,
    shoulderN: add(shoulder, [-FRONT.shoulderHalf, 0]) as Vec, shoulderF: add(shoulder, [FRONT.shoulderHalf, 0]) as Vec,
    hipN: add(hip, [-FRONT.hipHalf, 0]) as Vec, hipF: add(hip, [FRONT.hipHalf, 0]) as Vec,
  };
}

/** in front view the near (screen-left) side mirrors angles so + means "outward" for both sides */
const sideSign = (view: Anim['view'], limb: string) => (view === 'front' && limb.endsWith('N') ? -1 : 1);

function normalize(view: Anim['view'], p: Pose): Norm {
  const r = roots(view, p.hip, p.torso);
  const limbs = {} as Norm['limbs'];
  const spec = { armN: p.armN, armF: p.armF ?? p.armN, legN: p.legN, legF: p.legF ?? p.legN };
  for (const [name, l] of Object.entries(spec) as [keyof Norm['limbs'], Limb][]) {
    const arm = name.startsWith('arm');
    const root = arm ? (name === 'armN' ? r.shoulderN : r.shoulderF) : name === 'legN' ? r.hipN : r.hipF;
    const [a, b] = arm ? [SEG.upperArm, SEG.forearm] : [SEG.thigh, SEG.shin];
    const s = sideSign(view, name);
    if ('ik' in l) {
      // a shared IK target is given for the near side; the far side mirrors it in front view
      const derived = name.endsWith('F') && !(arm ? p.armF : p.legF);
      const target: Vec = view === 'front' && derived ? [2 * p.hip[0] - l.ik[0], l.ik[1]] : l.ik;
      const sol = ik2(root, target, a, b, (l.bend ?? 1) * (s as 1 | -1) as 1 | -1);
      limbs[name] = { ang: [angleOf([sol.mid[0] - root[0], sol.mid[1] - root[1]]) * s, angleOf([sol.end[0] - sol.mid[0], sol.end[1] - sol.mid[1]]) * s], end: sol.end, ik: true, bend: l.bend ?? 1 };
    } else {
      const mid = add(root, scale(downDir(l.a[0] * s), a));
      const end = add(mid, scale(downDir(l.a[1] * s), b));
      limbs[name] = { ang: [l.a[0], l.a[1]], end, ik: false, bend: 1 };
    }
  }
  return {
    hip: p.hip, torso: p.torso, head: p.head ?? p.torso, footN: p.footN ?? 0, footF: p.footF ?? p.footN ?? 0,
    tilt: p.tilt ?? 0, tiltAbout: p.tiltAbout ?? [p.hip[0], 0], limbs,
  };
}

function rotate(pt: Vec, about: Vec, deg: number): Vec {
  if (!deg) return pt;
  const c = Math.cos(deg * D);
  const s = Math.sin(deg * D);
  const x = pt[0] - about[0];
  const y = pt[1] - about[1];
  return [about[0] + x * c - y * s, about[1] + x * s + y * c];
}

/** Interpolates two normalised keys; limbs that are IK-pinned in both keys stay on their contact path. */
function blend(view: Anim['view'], A: Norm, B: Norm, t: number, props: Prop[]): Solved {
  const hip: Vec = [lerp(A.hip[0], B.hip[0], t), lerp(A.hip[1], B.hip[1], t)];
  const torso = lerpAngle(A.torso, B.torso, t);
  const head = lerpAngle(A.head, B.head, t);
  const r = roots(view, hip, torso);
  const out = { hip, shoulder: r.shoulder, hipN: r.hipN, hipF: r.hipF, shoulderN: r.shoulderN, shoulderF: r.shoulderF } as Record<string, Vec>;
  const set = (name: keyof Norm['limbs'], midJ: Joint, endJ: Joint) => {
    const la = A.limbs[name];
    const lb = B.limbs[name];
    const arm = name.startsWith('arm');
    const root = arm ? (name === 'armN' ? r.shoulderN : r.shoulderF) : name === 'legN' ? r.hipN : r.hipF;
    const [a, b] = arm ? [SEG.upperArm, SEG.forearm] : [SEG.thigh, SEG.shin];
    const s = sideSign(view, name);
    if (la.ik && lb.ik) {
      const target: Vec = [lerp(la.end[0], lb.end[0], t), lerp(la.end[1], lb.end[1], t)];
      const sol = ik2(root, target, a, b, (la.bend * s) as 1 | -1);
      out[midJ] = sol.mid;
      out[endJ] = sol.end;
    } else {
      const u = lerpAngle(la.ang[0], lb.ang[0], t) * s;
      const l = lerpAngle(la.ang[1], lb.ang[1], t) * s;
      out[midJ] = add(root, scale(downDir(u), a));
      out[endJ] = add(out[midJ]!, scale(downDir(l), b));
    }
  };
  set('armN', 'elbowN', 'wristN');
  set('armF', 'elbowF', 'wristF');
  set('legN', 'kneeN', 'ankleN');
  set('legF', 'kneeF', 'ankleF');
  const footN = lerp(A.footN, B.footN, t);
  const footF = lerp(A.footF, B.footF, t);
  const foot = (ankle: Vec, ang: number, side: 1 | -1) => {
    if (view === 'front') return { heel: add(ankle, [0, -2]) as Vec, toe: add(ankle, [side * 6, -SEG.ankleH + 2]) as Vec };
    const dir: Vec = [Math.cos(ang * D), Math.sin(ang * D)];
    return { heel: add(ankle, scale(dir, -SEG.heel)), toe: add(ankle, scale(dir, SEG.foot)) };
  };
  const fN = foot(out.ankleN!, footN, -1);
  const fF = foot(out.ankleF!, footF, 1);
  out.heelN = fN.heel; out.toeN = fN.toe; out.heelF = fF.heel; out.toeF = fF.toe;
  const headDir: Vec = [Math.sin(head * D), Math.cos(head * D)];
  out.head = add(r.shoulder, scale(headDir, SEG.neck + SEG.headR));
  // prop anchor
  const p0 = props.find((p) => 'at' in p) as Extract<Prop, { at: string }> | undefined;
  const torsoDir: Vec = [Math.sin(torso * D), Math.cos(torso * D)];
  const back: Vec = [-torsoDir[1], torsoDir[0]];
  out.prop =
    !p0 ? hip
    : p0.at === 'hands' ? scale(add(out.wristN!, out.wristF!), 0.5)
    : p0.at === 'handN' ? out.wristN!
    : p0.at === 'back' ? add(add(r.shoulder, scale(torsoDir, -6)), scale(back, 9))
    : p0.at === 'frontRack' ? add(add(r.shoulder, scale(torsoDir, -4)), scale(back, -10))
    : add(hip, scale(back, -6));
  const tilt = lerp(A.tilt, B.tilt, t);
  const about: Vec = [lerp(A.tiltAbout[0], B.tiltAbout[0], t), lerp(A.tiltAbout[1], B.tiltAbout[1], t)];
  const solved = {} as Solved;
  for (const j of JOINTS) solved[j] = rotate(out[j]!, about, tilt);
  solved.headAngle = head + tilt * (view === 'side' ? -1 : 0);
  return solved;
}

export const FPS = 30;

export interface Baked {
  view: Anim['view'];
  frames: number;
  /** per frame: JOINTS.length × (x, y) then headAngle */
  data: number[];
  stride: number;
  /** world bounding box including props, for fitting the figure to any size */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  cycle: number;
  props: Prop[];
}

/** Bakes an animation loop (last key eases back into the first) at 30 fps. */
export function bake(anim: Anim): Baked {
  const props = anim.props ?? [];
  const keys = anim.keys.map((k) => ({ ...k, n: normalize(anim.view, k.p) }));
  // timeline: key i arrives at T_i; the cycle wraps from the last key back to key 0 (key 0's dur)
  const segs: { from: number; to: number; dur: number; hold: number; ease?: Ease }[] = [];
  for (let i = 0; i < keys.length; i++) {
    const to = (i + 1) % keys.length;
    segs.push({ from: i, to, dur: keys[to]!.dur, hold: keys[i]!.hold ?? 0, ease: keys[to]!.ease });
  }
  const cycle = segs.reduce((s, g) => s + g.hold + g.dur, 0);
  const frames = Math.max(1, Math.round(cycle * FPS));
  const stride = JOINTS.length * 2 + 1;
  const data: number[] = [];
  const b = { minX: Infinity, maxX: -Infinity, minY: 0, maxY: -Infinity };
  for (let f = 0; f < frames; f++) {
    let t = (f / FPS) % cycle;
    let solved: Solved | null = null;
    for (const g of segs) {
      if (t < g.hold) { solved = blend(anim.view, keys[g.from]!.n, keys[g.from]!.n, 0, props); break; }
      t -= g.hold;
      if (t < g.dur) { solved = blend(anim.view, keys[g.from]!.n, keys[g.to]!.n, ease(g.ease, t / g.dur), props); break; }
      t -= g.dur;
    }
    solved ??= blend(anim.view, keys[0]!.n, keys[0]!.n, 0, props);
    for (const j of JOINTS) {
      const [x, y] = solved[j];
      data.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
      if (j !== 'prop') {
        b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
      }
    }
    data.push(Math.round(solved.headAngle * 10) / 10);
  }
  // head and hair stick out above the head centre
  b.maxY += SEG.headR + 8;
  b.minX -= 16; b.maxX += 16;
  for (const p of props) {
    if ('w' in p) { b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x + p.w); b.maxY = Math.max(b.maxY, p.y + p.h); }
    if (p.kind === 'bar') { b.maxY = Math.max(b.maxY, p.y + 10); b.minX = Math.min(b.minX, p.x - 30); b.maxX = Math.max(b.maxX, p.x + 30); }
    if ((p.kind === 'cable' || p.kind === 'band') && p.from) { b.minX = Math.min(b.minX, p.from[0]); b.maxX = Math.max(b.maxX, p.from[0]); b.maxY = Math.max(b.maxY, p.from[1]); }
    if (p.kind === 'barbell') { b.maxY += 0; }
  }
  return { view: anim.view, frames, data, stride, bounds: b, cycle, props };
}

/** Solved pose at key i (for tests: contact checks). */
export function solveKey(anim: Anim, i: number): Solved {
  const n = normalize(anim.view, anim.keys[i]!.p);
  return blend(anim.view, n, n, 0, anim.props ?? []);
}
