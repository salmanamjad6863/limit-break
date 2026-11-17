import { describe, expect, it } from 'vitest';
import { ANIMS, bake, exercises, ik2, JOINTS, SEG, solveKey, trainerAnimation, type Anim, type Limb } from '../src';

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

describe('trainer rig', () => {
  it('two-bone IK keeps bone lengths and reaches reachable targets', () => {
    const r = ik2([0, 94], [10, 20], SEG.thigh, SEG.shin, 1);
    expect(dist([0, 94], r.mid)).toBeCloseTo(SEG.thigh, 3);
    expect(dist(r.mid, r.end)).toBeCloseTo(SEG.shin, 3);
    expect(dist(r.end, [10, 20])).toBeLessThan(0.01);
    expect(r.mid[0]).toBeGreaterThan(0); // bend +1 → knee forward
  });
});

describe('trainer animations', () => {
  it('every exercise in the library has an animation', () => {
    const missing = exercises.map((e) => e.id).filter((id) => !ANIMS[id]);
    expect(missing).toEqual([]);
  });

  it('every pinned hand/foot actually reaches its contact point in every key (no floating limbs)', () => {
    const problems: string[] = [];
    for (const [id, anim] of Object.entries(ANIMS) as [string, Anim][]) {
      anim.keys.forEach((key, i) => {
        if (key.p.tilt) return; // tilted poses are checked visually in the Trainer lab
        const s = solveKey(anim, i);
        const check = (limb: Limb | undefined, end: readonly number[], label: string) => {
          if (limb && 'ik' in limb && !(anim.view === 'front' && label.endsWith('F'))) {
            const miss = dist(end, limb.ik);
            if (miss > 1.5) problems.push(`${id} key ${i} ${label} misses its target by ${miss.toFixed(1)}`);
          }
        };
        check(key.p.armN, s.wristN, 'armN');
        check(key.p.armF, s.wristF, 'armF');
        check(key.p.legN, s.ankleN, 'legN');
        check(key.p.legF, s.ankleF, 'legF');
      });
    }
    expect(problems).toEqual([]);
  });

  it('bakes every animation into a finite, sensible loop', () => {
    for (const id of Object.keys(ANIMS)) {
      const b = trainerAnimation(id)!;
      expect(b.frames, id).toBeGreaterThan(5);
      expect(b.cycle, id).toBeLessThan(12);
      expect(b.data.length, id).toBe(b.frames * b.stride);
      expect(b.data.every(Number.isFinite), id).toBe(true);
      expect(b.stride).toBe(JOINTS.length * 2 + 1);
    }
  });

  it('standing figures keep their feet on the ground', () => {
    const s = solveKey(ANIMS['bodyweight-squat']!, 1);
    expect(s.ankleN[1]).toBeCloseTo(SEG.ankleH, 0);
    expect(s.toeN[1]).toBeCloseTo(SEG.ankleH, 0);
  });

  it('push-ups keep hands planted while the body lowers', () => {
    const b = bake(ANIMS['push-up']!);
    const wrist = (f: number) => [b.data[f * b.stride + JOINTS.indexOf('wristN') * 2]!, b.data[f * b.stride + JOINTS.indexOf('wristN') * 2 + 1]!];
    const shoulderY = (f: number) => b.data[f * b.stride + JOINTS.indexOf('shoulder') * 2 + 1]!;
    const first = wrist(0);
    for (let f = 0; f < b.frames; f++) expect(dist(wrist(f), first), `frame ${f}`).toBeLessThan(1);
    const ys = Array.from({ length: b.frames }, (_, f) => shoulderY(f));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(35); // chest really goes down
  });
});
