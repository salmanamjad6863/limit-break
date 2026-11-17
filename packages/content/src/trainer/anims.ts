/**
 * Exercise animations for the 2D trainer (VISUALS.md §3.10). Every exercise maps to an animation;
 * families share geometry builders so variants stay consistent. Tempo ≈ real coaching tempo
 * (about 2 s lowering, 1 s lifting) unless the move is explosive or a hold.
 * Conventions: see rig.ts (y up, facing +x, limb angles from straight down, + forward).
 */
import { SEG, type Anim, type Key, type Limb, type Pose, type Prop, type Vec } from './rig';

const D = Math.PI / 180;
const LEG = SEG.thigh + SEG.shin; // 88
const BODY = LEG + SEG.torso; // 142, ankle → shoulder when the body is a straight line
const HIP_Y = LEG + SEG.ankleH; // 94 standing

const side = (keys: Key[], props?: Prop[]): Anim => ({ view: 'side', keys, props });
const front = (keys: Key[], props?: Prop[]): Anim => ({ view: 'front', keys, props });
const k = (p: Pose, dur: number, hold = 0, ease: Key['ease'] = 'inOut'): Key => ({ p, dur, hold, ease });
const fk = (u: number, l: number): Limb => ({ a: [u, l] });
const ik = (x: number, y: number, bend: 1 | -1 = 1): Limb => ({ ik: [x, y], bend });

const FEET = { legN: ik(3, SEG.ankleH), legF: ik(-3, SEG.ankleH) };
const stand = (o: Partial<Pose> = {}): Pose => ({ hip: [0, HIP_Y], torso: 0, armN: fk(6, 10), ...FEET, ...o });

/** Straight body from a pivot (toes/knees) to the shoulders at a given shoulder height. */
function line(pivot: Vec, shoulderY: number, length = BODY, legLen = LEG, back = false) {
  const e = Math.asin(Math.max(-1, Math.min(1, (shoulderY - pivot[1]) / length)));
  const dir: Vec = [Math.cos(e) * (back ? -1 : 1), Math.sin(e)];
  return {
    hip: [pivot[0] + dir[0] * legLen, pivot[1] + dir[1] * legLen] as Vec,
    shoulder: [pivot[0] + dir[0] * length, pivot[1] + dir[1] * length] as Vec,
    torso: (back ? -1 : 1) * (90 - e / D),
  };
}

/* ======================= squat family ======================= */
function squat(o: { depth?: number; lean?: number; arms?: Limb; armsTop?: Limb; props?: Prop[]; down?: number; up?: number } = {}): Anim {
  const depth = o.depth ?? 46; // hip height at the bottom
  const arms = o.arms ?? fk(80, 88);
  return side([
    k(stand({ armN: o.armsTop ?? arms }), o.up ?? 1.1, 0.4),
    k({ hip: [-24, depth], torso: o.lean ?? 34, armN: arms, ...FEET }, o.down ?? 1.9, 0.2),
  ], o.props);
}
const backRack = fk(-35, 160);
const frontRack = fk(92, 205);

/* ======================= hinge family ======================= */
function hinge(o: { props?: Prop[]; fromFloor?: boolean; singleLeg?: boolean } = {}): Anim {
  const top = stand({ armN: fk(2, 2), ...(o.singleLeg ? { legN: ik(3, 6), legF: ik(-3, 6) } : {}) });
  if (o.fromFloor) {
    return side([k({ hip: [-22, 52], torso: 56, armN: fk(0, 0), ...FEET }, 1.6, 0.4), k(stand({ armN: fk(0, 0) }), 1.2, 0.5)], o.props);
  }
  const bottom: Pose = o.singleLeg
    ? { hip: [-6, 88], torso: 82, armN: fk(0, 0), legN: ik(3, 6), legF: fk(-84, -84), footF: -10 }
    : { hip: [-30, 88], torso: 74, armN: fk(0, 0), ...FEET };
  return side([k(top, 1.1, 0.4), k(bottom, 2.0, 0.2)], o.props);
}

/* ======================= bridge / thrust ======================= */
function bridge(o: { shoulderY?: number; singleLeg?: boolean; props?: Prop[] } = {}): Anim {
  const sy = o.shoulderY ?? 10;
  const legs = { legN: ik(36, 6, 1), legF: o.singleLeg ? fk(118, 118) : ik(32, 6, 1) };
  const up = line([-52, sy], sy + 40, 58, 0); // shoulders → hips rising
  return side([
    k({ hip: [2, sy + 2], torso: -88, head: -90, armN: fk(84, 90), ...legs }, 1.0, 0.3),
    k({ hip: [up.shoulder[0] + 4, sy + 44], torso: -112, head: -92, armN: fk(80, 90), ...legs }, 0.9, 0.8),
  ], o.props);
}

/* ======================= lunge family ======================= */
function lunge(o: { backFoot?: Vec; backFootAngle?: number; arms?: Limb; props?: Prop[] } = {}): Anim {
  const back = o.backFoot ?? [-36, 12];
  const legs = { legN: ik(30, 6, 1), legF: ik(back[0], back[1], 1), footF: o.backFootAngle ?? -55 };
  const arms = o.arms ?? fk(4, 8);
  return side([
    k({ hip: [-3, 84], torso: 3, armN: arms, ...legs }, 1.0, 0.3),
    k({ hip: [-5, 52], torso: 6, armN: arms, ...legs }, 1.8, 0.2),
  ], o.props);
}

/* ======================= push family (plank-based) ======================= */
function pushUp(o: { pivot?: Vec; knees?: boolean; handY?: number; arms?: 'tight' | 'normal'; props?: Prop[]; down?: number } = {}): Anim {
  const handY = o.handY ?? 6;
  if (o.knees) {
    const knee: Vec = [-40, 8];
    const top = line(knee, handY + 59, SEG.thigh + SEG.torso, SEG.thigh);
    const bot = line(knee, handY + 18, SEG.thigh + SEG.torso, SEG.thigh);
    const hands = ik(top.shoulder[0], handY, -1);
    const legs = { legN: ik(knee[0] - 30, knee[1] + 31, 1), legF: ik(knee[0] - 30, knee[1] + 31, 1) };
    return side([k({ hip: top.hip, torso: top.torso, armN: hands, ...legs }, 1.0, 0.3), k({ hip: bot.hip, torso: bot.torso, armN: hands, ...legs }, o.down ?? 1.8, 0.2)], o.props);
  }
  const pivot = o.pivot ?? ([-100, 14] as Vec);
  const top = line(pivot, handY + 59);
  const bot = line(pivot, handY + 17);
  const hands = ik(top.shoulder[0], handY, -1);
  const legs = { legN: ik(pivot[0], pivot[1]), legF: ik(pivot[0], pivot[1]), footN: -68, footF: -68 };
  return side([
    k({ hip: top.hip, torso: top.torso, armN: hands, ...legs }, 1.0, 0.3),
    k({ hip: bot.hip, torso: bot.torso, armN: hands, ...legs }, o.down ?? 1.8, 0.2),
  ], o.props);
}

function plankHold(): Anim {
  const pivot: Vec = [-100, 14];
  const l = line(pivot, 37);
  const p: Pose = { hip: l.hip, torso: l.torso, armN: fk(0, 90), legN: ik(pivot[0], pivot[1]), legF: ik(pivot[0], pivot[1]), footN: -68, footF: -68 };
  const breathe: Pose = { ...p, hip: [l.hip[0], l.hip[1] + 1.5] };
  return side([k(p, 2.0, 0), k(breathe, 2.0, 0)]);
}

/* ======================= lying presses ======================= */
function lyingPress(o: { benchY?: number; incline?: number; props: Prop[]; elbowsToFloor?: boolean }): Anim {
  const y = o.benchY ?? 48;
  const torso = -(o.incline ? 90 - o.incline : 90);
  const legs = { legN: ik(44, 6, 1), legF: ik(40, 6, 1) };
  const hip: Vec = [0, y];
  return side([
    k({ hip, torso, head: torso - 2, armN: fk(180 + (torso + 90) * 0.0, 180), ...legs }, 1.0, 0.3),
    k({ hip, torso, head: torso - 2, armN: fk(o.elbowsToFloor ? 120 : 132, 182), ...legs }, 1.9, 0.2),
  ], o.props);
}

/* ======================= standing presses / arms ======================= */
const ohp = (props: Prop[], seated = false): Anim => {
  const base = seated ? { hip: [0, 50] as Vec, legN: ik(40, 6, 1), legF: ik(36, 6, 1) } : { hip: [0, HIP_Y] as Vec, ...FEET };
  return side([k({ ...base, torso: 0, armN: fk(30, 175) }, 1.6, 0.3), k({ ...base, torso: -3, armN: fk(176, 180) }, 1.1, 0.4)], props);
};
const curl = (props: Prop[]): Anim => side([k(stand({ armN: fk(-2, 0) }), 1.8, 0.3), k(stand({ armN: fk(4, 150) }), 1.0, 0.4)], props);
const lateral = (props: Prop[]): Anim =>
  front([k(stand({ armN: fk(10, 12) }), 1.8, 0.2), k(stand({ armN: fk(84, 88) }), 1.0, 0.4)], props);

/* ======================= hang / pull ======================= */
function pullUp(o: { down?: number; up?: number; band?: boolean; raise?: 'knee' | 'leg' } = {}): Anim {
  const bar: Vec = [8, 250]; // high enough that the feet clearly hang
  const hands = ik(bar[0], bar[1] - 2, -1);
  const legsHang = { legN: fk(6, -18), legF: fk(2, -24) };
  const hang: Pose = { hip: [0, bar[1] - 59 - SEG.torso - 2], torso: -4, armN: hands, ...legsHang };
  const props: Prop[] = [{ kind: 'bar', x: bar[0], y: bar[1] }, ...(o.band ? [{ kind: 'band' as const, from: bar }] : [])];
  if (o.raise) {
    const lifted = o.raise === 'knee' ? { legN: fk(98, -6), legF: fk(94, -10) } : { legN: fk(92, 92), legF: fk(88, 88) };
    return side([k(hang, 1.4, 0.3), k({ ...hang, ...lifted }, 1.2, 0.4)], props);
  }
  const top: Pose = { hip: [2, bar[1] - 24 - SEG.torso], torso: -6, armN: hands, legN: fk(10, -20), legF: fk(6, -26) };
  return side([k(hang, o.down ?? 1.9, 0.3), k(top, o.up ?? 1.1, 0.4)], props);
}

function row(o: { torso: number; hip: Vec; legs: Pick<Pose, 'legN' | 'legF'>; reach: Limb; pull: Limb; props: Prop[]; armF?: Limb }): Anim {
  return side([
    k({ hip: o.hip, torso: o.torso, armN: o.reach, armF: o.armF ?? o.reach, ...o.legs }, 1.8, 0.3),
    k({ hip: o.hip, torso: o.torso, armN: o.pull, armF: o.armF ?? o.pull, ...o.legs }, 1.0, 0.4),
  ], o.props);
}

/* ======================= cyclic / cardio ======================= */
function gait(o: { run?: boolean; props?: Prop[]; armsHold?: Limb } = {}): Anim {
  const r = !!o.run;
  const lift = r ? 10 : 0;
  const a = (thighN: number, shinN: number, thighF: number, shinF: number, armSwing: number, hipY: number): Pose => ({
    hip: [0, hipY], torso: r ? 8 : 3,
    armN: o.armsHold ?? fk(-armSwing, r ? 90 - armSwing : 10 - armSwing),
    armF: o.armsHold ?? fk(armSwing, r ? 90 + armSwing : 10 + armSwing),
    legN: fk(thighN, shinN), legF: fk(thighF, shinF),
  });
  const t = r ? 0.18 : 0.32;
  return side([
    k(a(r ? 40 : 22, r ? -10 : 8, r ? -28 : -18, r ? -70 : -30, r ? 34 : 22, HIP_Y - 4 + lift), t, 0, 'linear'),
    k(a(r ? 10 : 0, r ? -40 : -4, r ? 10 : 2, r ? -90 : -12, 0, HIP_Y - 2), t, 0, 'linear'),
    k(a(r ? -28 : -18, r ? -70 : -30, r ? 40 : 22, r ? -10 : 8, r ? -34 : -22, HIP_Y - 4 + lift), t, 0, 'linear'),
    k(a(r ? 10 : 2, r ? -90 : -12, r ? 10 : 0, r ? -40 : -4, 0, HIP_Y - 2), t, 0, 'linear'),
  ], o.props);
}

function quadruped(o: { phase2: Partial<Pose>; dur?: number }): Anim {
  const base: Pose = { hip: [-26, 51], torso: 75, head: 82, armN: ik(26, 6, -1), legN: ik(-69, 8, 1), footN: 0 };
  return side([k(base, o.dur ?? 1.4, 0.4), k({ ...base, ...o.phase2 }, o.dur ?? 1.4, 0.8)]);
}

const supine = (o: Partial<Pose>): Pose => ({ hip: [0, 10], torso: -90, head: -90, armN: fk(84, 90), legN: ik(40, 6, 1), legF: ik(36, 6, 1), ...o });

/* ======================= the library ======================= */
const DB: Prop = { kind: 'dumbbell', at: 'hands' };
const BB_HANDS: Prop = { kind: 'barbell', at: 'hands' };
const FLAT_BENCH: Prop = { kind: 'bench', x: -82, y: 0, w: 100, h: 40 };

const pl = (top: Pose, pivot: Vec) => top; // (readability helper for burpee keys)

function burpee(): Anim {
  const pivot: Vec = [-100, 14];
  const pk = line(pivot, 65);
  const hands = ik(pk.shoulder[0], 6, -1);
  return side([
    k(stand({ armN: fk(4, 8) }), 0.5, 0.15),
    k({ hip: [-14, 30], torso: 62, armN: ik(28, 6, -1), ...FEET }, 0.45),
    k(pl({ hip: pk.hip, torso: pk.torso, armN: hands, legN: ik(pivot[0], pivot[1]), legF: ik(pivot[0], pivot[1]), footN: -68, footF: -68 }, pivot), 0.35, 0.15),
    k({ hip: [-14, 30], torso: 62, armN: ik(28, 6, -1), ...FEET }, 0.35),
    k(stand({ hip: [0, HIP_Y + 22], armN: fk(176, 180), legN: ik(3, 28), legF: ik(-3, 28), footN: -40, footF: -40 }), 0.4, 0.05),
  ]);
}

export const ANIMS: Record<string, Anim> = {
  /* push */
  'push-up': pushUp(),
  'incline-push-up': pushUp({ handY: 46, props: [{ kind: 'bench', x: 10, y: 0, w: 60, h: 40 }] }),
  'decline-push-up': pushUp({ pivot: [-100, 48], props: [{ kind: 'bench', x: -130, y: 0, w: 50, h: 40 }] }),
  'knee-push-up': pushUp({ knees: true }),
  'diamond-push-up': pushUp({ down: 2.0 }),
  'archer-push-up': pushUp({ down: 2.2 }),
  'bench-press': lyingPress({ props: [FLAT_BENCH, BB_HANDS] }),
  'db-bench-press': lyingPress({ props: [FLAT_BENCH, DB] }),
  'incline-db-press': lyingPress({ incline: 35, props: [{ kind: 'bench', x: -70, y: 0, w: 90, h: 40 }, DB] }),
  'db-floor-press': lyingPress({ benchY: 10, elbowsToFloor: true, props: [DB] }),
  'machine-chest-press': side([
    k({ hip: [0, 50], torso: -6, armN: fk(-30, 92), legN: ik(40, 6, 1), legF: ik(36, 6, 1) }, 1.8, 0.3),
    k({ hip: [0, 50], torso: -6, armN: fk(86, 90), legN: ik(40, 6, 1), legF: ik(36, 6, 1) }, 1.0, 0.4),
  ], [{ kind: 'bench', x: -30, y: 0, w: 40, h: 42 }]),
  dip: side([
    k({ hip: [-4, 126], torso: 8, armN: ik(4, 128, -1), legN: fk(10, -70), legF: fk(14, -64) }, 1.0, 0.3),
    k({ hip: [-14, 96], torso: 26, armN: ik(4, 128, -1), legN: fk(10, -70), legF: fk(14, -64) }, 1.8, 0.2),
  ], [{ kind: 'bar', x: 4, y: 126 }]),
  'pike-push-up': side([
    k({ hip: [-22, 96], torso: 138, head: 150, armN: ik(40, 6, -1), legN: ik(-50, 14), legF: ik(-53, 14), footN: -60, footF: -60 }, 1.0, 0.3),
    k({ hip: [-16, 88], torso: 160, head: 172, armN: ik(40, 6, -1), legN: ik(-50, 14), legF: ik(-53, 14), footN: -60, footF: -60 }, 1.8, 0.2),
  ]),
  'wall-handstand-push-up': (() => {
    const top: Pose = { hip: [0, HIP_Y], torso: 0, armN: ik(4, 206, -1), legN: fk(0, 0), legF: fk(-2, 0) };
    const bottom: Pose = { ...top, hip: [0, HIP_Y + 22] };
    const about: Vec = [2, (206 + 6) / 2];
    return side([k({ ...top, tilt: 180, tiltAbout: about }, 1.0, 0.3), k({ ...bottom, tilt: 180, tiltAbout: about }, 1.9, 0.2)], [{ kind: 'wall', x: 30 }]);
  })(),
  'overhead-press': ohp([BB_HANDS]),
  'db-shoulder-press': ohp([DB]),
  'machine-shoulder-press': ohp([{ kind: 'bench', x: -30, y: 0, w: 40, h: 42 }], true),
  'band-overhead-press': ohp([{ kind: 'band', from: [0, 6] }]),

  /* pull */
  'pull-up': pullUp(),
  'chin-up': pullUp(),
  'negative-pull-up': pullUp({ down: 4.0, up: 0.6 }),
  'band-assisted-pull-up': pullUp({ band: true }),
  'lat-pulldown': side([
    k({ hip: [0, 46], torso: -8, armN: fk(172, 176), legN: ik(34, 6, 1), legF: ik(30, 6, 1) }, 1.8, 0.3),
    k({ hip: [0, 46], torso: -14, armN: fk(-22, 196), legN: ik(34, 6, 1), legF: ik(30, 6, 1) }, 1.0, 0.4),
  ], [{ kind: 'bench', x: -26, y: 0, w: 40, h: 40 }, { kind: 'cable', from: [6, 236] }]),
  'band-pulldown': side([
    k(stand({ torso: -4, armN: fk(168, 174) }), 1.8, 0.3),
    k(stand({ torso: -6, armN: fk(-24, 192) }), 1.0, 0.4),
  ], [{ kind: 'band', from: [20, 232] }]),
  'barbell-row': row({ torso: 68, hip: [-24, 84], legs: FEET, reach: fk(0, 0), pull: fk(-58, 14), props: [BB_HANDS] }),
  'db-row': row({ torso: 80, hip: [-18, 86], legs: { legN: ik(4, 6), legF: ik(-34, 6) }, reach: fk(0, 0), pull: fk(-58, 12), armF: ik(40, 42, -1),
    props: [{ kind: 'bench', x: 24, y: 0, w: 60, h: 40 }, { kind: 'dumbbell', at: 'handN' }] }),
  'chest-supported-row': row({ torso: 52, hip: [-10, 70], legs: FEET, reach: fk(10, 10), pull: fk(-40, 30), props: [{ kind: 'bench', x: -6, y: 0, w: 36, h: 70 }, DB] }),
  'seated-cable-row': row({ torso: 0, hip: [0, 18], legs: { legN: ik(74, 24, 1), legF: ik(70, 24, 1) }, reach: fk(86, 90), pull: fk(-38, 86),
    props: [{ kind: 'cable', from: [130, 34] }] }),
  'band-row': row({ torso: 2, hip: [0, HIP_Y], legs: FEET, reach: fk(86, 90), pull: fk(-34, 86), props: [{ kind: 'band', from: [130, 112] }] }),
  'doorframe-row': (() => {
    // feet by the frame, straight body leaning back, hands on the frame at chest height
    const pivot: Vec = [20, 6];
    const bot = line(pivot, 139, BODY, LEG, true);
    const top = line(pivot, 146, BODY, LEG, true);
    const hands = ik(29, 136, -1);
    const legs = { legN: ik(pivot[0], pivot[1]), legF: ik(pivot[0], pivot[1]) };
    return side([k({ hip: bot.hip, torso: bot.torso, armN: hands, ...legs }, 1.8, 0.3), k({ hip: top.hip, torso: top.torso, armN: hands, ...legs }, 1.0, 0.4)],
      [{ kind: 'wall', x: 33 }]);
  })(),
  'inverted-row': (() => {
    const ankle: Vec = [150, 8];
    const bot = line(ankle, 22, BODY, LEG, true);
    const top = line(ankle, 66, BODY, LEG, true);
    const hands = ik(bot.shoulder[0], 80, 1);
    const legs = { legN: ik(ankle[0], ankle[1]), legF: ik(ankle[0], ankle[1]), footN: 70, footF: 70 };
    return side([k({ hip: bot.hip, torso: bot.torso, head: bot.torso, armN: hands, ...legs }, 1.8, 0.3), k({ hip: top.hip, torso: top.torso, head: top.torso, armN: hands, ...legs }, 1.0, 0.4)],
      [{ kind: 'bar', x: bot.shoulder[0], y: 82 }]);
  })(),

  /* squat / legs */
  'bodyweight-squat': squat(),
  'goblet-squat': squat({ arms: fk(18, 168), lean: 22, depth: 44, props: [{ kind: 'dumbbell', at: 'hands' }] }),
  'back-squat': squat({ arms: backRack, lean: 40, props: [{ kind: 'barbell', at: 'back' }] }),
  'front-squat': squat({ arms: frontRack, lean: 16, depth: 44, props: [{ kind: 'barbell', at: 'frontRack' }] }),
  'jump-squat': side([
    k(stand({ hip: [0, HIP_Y + 24], armN: fk(-30, -20), legN: ik(3, 30), legF: ik(-3, 30), footN: -45, footF: -45 }), 0.35, 0.05, 'out'),
    k({ hip: [-22, 52], torso: 36, armN: fk(-40, -30), ...FEET }, 0.45, 0.1, 'in'),
  ]),
  'pistol-squat': side([
    k(stand({ armN: fk(84, 88), legF: fk(40, 40) }), 1.2, 0.3),
    k({ hip: [-18, 40], torso: 40, armN: fk(84, 88), legN: ik(4, 6), legF: fk(84, 88) }, 2.0, 0.2),
  ]),
  'wall-sit': side([
    k({ hip: [-18, 50], torso: 0, armN: fk(40, 70), legN: ik(26, 6), legF: ik(22, 6) }, 2, 0),
    k({ hip: [-18, 51], torso: 0, armN: fk(40, 70), legN: ik(26, 6), legF: ik(22, 6) }, 2, 0),
  ], [{ kind: 'wall', x: -32 }]),
  'deep-squat-hold': side([
    k({ hip: [-20, 34], torso: 30, armN: fk(40, 84), ...FEET }, 2, 0),
    k({ hip: [-20, 36], torso: 28, armN: fk(40, 84), ...FEET }, 2, 0),
  ]),
  'leg-press': side([
    k({ hip: [0, 36], torso: -55, head: -40, armN: fk(20, 30), legN: ik(66, 92, 1), legF: ik(62, 90, 1), footN: 60, footF: 60 }, 1.1, 0.4),
    k({ hip: [0, 36], torso: -55, head: -40, armN: fk(20, 30), legN: ik(40, 78, 1), legF: ik(36, 76, 1), footN: 60, footF: 60 }, 1.9, 0.2),
  ], [{ kind: 'bench', x: -50, y: 0, w: 60, h: 30 }]),
  'split-squat': lunge(),
  'reverse-lunge': lunge({ arms: fk(4, 40) }),
  'walking-lunge': lunge({ arms: fk(10, 20) }),
  'bulgarian-split-squat': lunge({ backFoot: [-44, 44], backFootAngle: -20, props: [{ kind: 'bench', x: -80, y: 0, w: 50, h: 40 }] }),
  'step-up': side([
    k({ hip: [4, 86], torso: 6, armN: fk(10, 20), legN: ik(30, 42, 1), legF: ik(-4, 6) }, 1.2, 0.3),
    k({ hip: [28, 128], torso: 2, armN: fk(-10, 0), legN: ik(30, 42, 1), legF: fk(70, -10) }, 1.2, 0.4),
  ], [{ kind: 'box', x: 16, y: 0, w: 46, h: 36 }]),
  'standing-calf-raise': side([
    k(stand(), 1.2, 0.3),
    k(stand({ hip: [0, HIP_Y + 10], legN: ik(3, 16), legF: ik(-3, 16), footN: -40, footF: -40 }), 0.9, 0.6),
  ]),
  'leg-curl': side([
    k({ hip: [0, 50], torso: 90, head: 96, armN: fk(10, 40), legN: fk(-90, -90), legF: fk(-92, -92) }, 1.8, 0.3),
    k({ hip: [0, 50], torso: 90, head: 96, armN: fk(10, 40), legN: fk(-90, -200), legF: fk(-92, -202) }, 1.0, 0.4),
  ], [{ kind: 'bench', x: -70, y: 0, w: 140, h: 42 }]),

  /* hinge / glutes */
  'romanian-deadlift': hinge({ props: [BB_HANDS] }),
  'db-romanian-deadlift': hinge({ props: [DB] }),
  'single-leg-rdl': hinge({ singleLeg: true }),
  deadlift: hinge({ fromFloor: true, props: [BB_HANDS] }),
  'kettlebell-swing': side([
    k({ hip: [-24, 80], torso: 64, armN: fk(-24, -30), ...FEET }, 0.55, 0, 'in'),
    k(stand({ armN: fk(92, 94) }), 0.45, 0.1, 'out'),
  ], [{ kind: 'kettlebell', at: 'hands' }]),
  'glute-bridge': bridge(),
  'single-leg-glute-bridge': bridge({ singleLeg: true }),
  'hip-thrust': bridge({ shoulderY: 40, props: [{ kind: 'bench', x: -90, y: 0, w: 40, h: 40 }, { kind: 'barbell', at: 'hip' }] }),

  /* arms / shoulders */
  'db-curl': curl([DB]),
  'band-curl': curl([{ kind: 'band', from: [4, 6] }]),
  'triceps-pushdown': side([
    k(stand({ torso: 8, armN: fk(-6, 100) }), 1.0, 0.3),
    k(stand({ torso: 8, armN: fk(-6, -4) }), 1.4, 0.4),
  ], [{ kind: 'cable', from: [24, 230] }]),
  'overhead-triceps-extension': side([
    k(stand({ armN: fk(172, 178) }), 1.0, 0.4),
    k(stand({ armN: fk(170, 20) }), 1.8, 0.2),
  ], [DB]),
  'db-lateral-raise': lateral([DB]),
  'band-pull-apart': front([k(stand({ armN: fk(84, 86) }), 1.4, 0.3), k(stand({ armN: fk(88, 92) }), 1.0, 0.4)], [{ kind: 'band' }]),
  'face-pull': side([
    k(stand({ armN: fk(88, 90) }), 1.6, 0.3),
    k(stand({ armN: fk(96, 200) }), 1.0, 0.5),
  ], [{ kind: 'cable', from: [130, 162] }]),
  'prone-ytw': side([
    k(supine({ hip: [0, 10], torso: 90, head: 96, armN: fk(94, 94), legN: fk(-90, -90), legF: fk(-91, -91) }), 1.4, 0.3),
    k(supine({ hip: [0, 10], torso: 90, head: 100, armN: fk(112, 112), legN: fk(-90, -90), legF: fk(-91, -91) }), 1.0, 0.6),
  ]),

  /* core */
  plank: plankHold(),
  // body rotated 75° about the feet so it rises ~15° off the floor; the bottom (near) forearm is on the floor under the shoulder
  'side-plank': front([
    k({ hip: [0, HIP_Y], torso: 0, armN: fk(75, 165), armF: fk(4, 4), legN: fk(0, 0), legF: fk(1, 1), tilt: 75, tiltAbout: [0, 6] }, 2, 0),
    k({ hip: [0, HIP_Y + 1.5], torso: 0, armN: fk(75, 165), armF: fk(4, 4), legN: fk(0, 0), legF: fk(1, 1), tilt: 74.5, tiltAbout: [0, 6] }, 2, 0),
  ]),
  'dead-bug': side([
    k(supine({ armN: fk(180, 180), legN: fk(176, 90), legF: fk(174, 92) }), 1.2, 0.3),
    k(supine({ armN: fk(-92, -92), armF: fk(180, 180), legN: fk(176, 90), legF: fk(96, 94) }), 1.8, 0.6),
  ]),
  'hollow-hold': side([
    k(supine({ hip: [0, 8], torso: -78, head: -70, armN: fk(-104, -104), legN: fk(78, 78), legF: fk(80, 80) }), 2, 0),
    k(supine({ hip: [0, 8], torso: -79, head: -71, armN: fk(-103, -103), legN: fk(79, 79), legF: fk(81, 81) }), 2, 0),
  ]),
  'bird-dog': quadruped({ phase2: { armN: fk(96, 92), legF: fk(-86, -88), footF: 0 }, dur: 1.4 }),
  'pallof-press': side([
    k(stand({ armN: fk(10, 130) }), 1.4, 0.3),
    k(stand({ armN: fk(86, 90) }), 1.2, 1.2),
  ], [{ kind: 'cable', from: [-110, 128] }]),
  'hanging-knee-raise': pullUp({ raise: 'knee' }),
  'hanging-leg-raise': pullUp({ raise: 'leg' }),

  /* carries / cardio / conditioning */
  'farmer-carry': gait({ armsHold: fk(2, 2), props: [DB] }),
  'brisk-walk': gait(),
  'easy-run': gait({ run: true }),
  'jumping-jack': front([
    k(stand({ armN: fk(8, 10), legN: ik(-6, 6), legF: ik(6, 6) }), 0.34, 0.02),
    k(stand({ hip: [0, HIP_Y - 2], armN: fk(168, 176), legN: ik(-30, 6), legF: ik(30, 6) }), 0.34, 0.02),
  ]),
  'high-knees': side([
    k({ hip: [0, HIP_Y + 2], torso: 4, armN: fk(-30, 60), armF: fk(40, 120), legN: fk(96, -10), legF: ik(-2, 8), footF: -30 }, 0.22, 0, 'linear'),
    k({ hip: [0, HIP_Y + 2], torso: 4, armN: fk(40, 120), armF: fk(-30, 60), legN: ik(2, 8), legF: fk(96, -10), footN: -30 }, 0.22, 0, 'linear'),
  ]),
  'mountain-climber': (() => {
    const pivot: Vec = [-100, 14];
    const l = line(pivot, 65);
    const hands = ik(l.shoulder[0], 6, -1);
    const base: Pose = { hip: l.hip, torso: l.torso, armN: hands, legN: ik(pivot[0], pivot[1]), legF: ik(pivot[0], pivot[1]), footN: -68, footF: -68 };
    return side([
      k({ ...base, legN: fk(122, 20) }, 0.24, 0, 'linear'),
      k({ ...base, legF: fk(122, 20) }, 0.24, 0, 'linear'),
    ]);
  })(),
  'skater-hop': front([
    k(stand({ hip: [-26, HIP_Y - 10], torso: 0, armN: fk(40, 60), armF: fk(-20, 0), legN: ik(-30, 6), legF: fk(-20, -30) }), 0.45, 0.1),
    k(stand({ hip: [26, HIP_Y - 10], torso: 0, armN: fk(-20, 0), armF: fk(40, 60), legN: fk(-20, -30), legF: ik(30, 6) }), 0.45, 0.1),
  ]),
  burpee: burpee(),

  /* mobility */
  'cat-cow': quadruped({ phase2: { hip: [-26, 46], torso: 70, head: 60 }, dur: 2.0 }),
  'worlds-greatest-stretch': side([
    k({ hip: [-8, 36], torso: 64, armN: ik(30, 6, -1), armF: ik(26, 6, -1), legN: ik(30, 6, 1), legF: ik(-70, 12), footF: -60 }, 1.4, 0.4),
    k({ hip: [-8, 36], torso: 64, armN: ik(30, 6, -1), armF: fk(178, 180), legN: ik(30, 6, 1), legF: ik(-70, 12), footF: -60 }, 1.6, 1.0),
  ]),
  'hip-flexor-stretch': side([
    k({ hip: [-6, 52], torso: -2, armN: fk(10, 60), legN: ik(34, 6, 1), legF: ik(-50, 8, 1), footF: 0 }, 2, 0.5),
    k({ hip: [2, 50], torso: -6, armN: fk(176, 180), legN: ik(34, 6, 1), legF: ik(-50, 8, 1), footF: 0 }, 2, 1.0),
  ]),
  'thoracic-open-book': side([
    k(supine({ hip: [0, 10], torso: -90, head: -90, armN: fk(90, 90), legN: fk(150, 60), legF: fk(150, 60) }), 1.6, 0.6),
    k(supine({ hip: [0, 10], torso: -90, head: -100, armN: fk(-90, -90), armF: fk(90, 90), legN: fk(150, 60), legF: fk(150, 60) }), 2.0, 1.0),
  ]),
  // sitting back on the heels, knees on the floor, chest folded over the thighs, arms long on the floor
  'childs-pose': side([
    k({ hip: [-28, 22], torso: 100, head: 106, armN: fk(96, 92), legN: ik(-28, 8, 1), legF: ik(-30, 8, 1), footN: 180, footF: 180 }, 2.5, 0),
    k({ hip: [-28, 24], torso: 98, head: 104, armN: fk(96, 92), legN: ik(-28, 8, 1), legF: ik(-30, 8, 1), footN: 180, footF: 180 }, 2.5, 0),
  ]),
  // seated on the floor: front leg folded forward, back leg folded behind (shins point at the camera, so they read short)
  'ninety-ninety': side([
    k({ hip: [0, 12], torso: 10, armN: fk(40, 80), legN: fk(90, -125), legF: fk(-90, 125), footN: 90, footF: 90 }, 2, 0.6),
    k({ hip: [0, 12], torso: 42, armN: fk(64, 92), legN: fk(90, -125), legF: fk(-90, 125), footN: 90, footF: 90 }, 2, 1.0),
  ]),
  'downward-dog': side([
    k({ hip: [-30, 92], torso: 140, head: 150, armN: ik(44, 6, -1), legN: ik(-52, 8), legF: ik(-52, 8), footN: -20, footF: -20 }, 2.5, 0),
    k({ hip: [-30, 93], torso: 141, head: 151, armN: ik(44, 6, -1), legN: ik(-52, 8), legF: ik(-52, 8), footN: -14, footF: -14 }, 2.5, 0),
  ]),
  'shoulder-dislocate': side([
    k(stand({ armN: fk(40, 40) }), 1.6, 0.2),
    k(stand({ armN: fk(178, 178) }), 1.6, 0.2),
    k(stand({ armN: fk(-150, -150) }), 1.6, 0.2),
  ], [{ kind: 'band' }]),
};

/** Standing breath loop for rest and "get ready" steps. */
export const IDLE: Anim = side([k(stand({ armN: fk(6, 10) }), 2.0, 0), k(stand({ hip: [0, HIP_Y + 1], armN: fk(8, 12) }), 2.0, 0)]);
