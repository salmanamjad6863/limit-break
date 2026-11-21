import { describe, expect, it } from 'vitest';
import { exerciseById, exercises, focusedWorkouts, programs, quickSessions } from '../src';

describe('training content integrity', () => {
  it('has a real library', () => expect(exercises.length).toBeGreaterThanOrEqual(80));
  it('every exercise has coaching cues', () => {
    for (const e of exercises) expect(e.cues.length, e.id).toBeGreaterThanOrEqual(1);
  });
  it('program prefer ids exist and match the slot pattern (or a fallback)', () => {
    for (const p of programs)
      for (const d of p.days)
        for (const s of d.slots)
          for (const id of s.prefer ?? []) {
            const e = exerciseById.get(id);
            expect(e, `${p.id}/${d.id}: ${id}`).toBeTruthy();
            expect([s.pattern, ...(s.fallback ?? [])], `${p.id}/${d.id}: ${id} pattern ${e!.pattern}`).toContain(e!.pattern);
          }
  });
  it('focused workout prefer ids exist and match the slot pattern', () => {
    for (const f of focusedWorkouts)
      for (const s of f.slots)
        for (const id of s.prefer ?? []) {
          const e = exerciseById.get(id);
          expect(e, `${f.id}: ${id}`).toBeTruthy();
          expect([s.pattern, ...(s.fallback ?? [])], `${f.id}: ${id}`).toContain(e!.pattern);
        }
  });
  it('ids are unique and there is enough to choose from', () => {
    expect(new Set(programs.map((p) => p.id)).size).toBe(programs.length);
    expect(new Set(focusedWorkouts.map((f) => f.id)).size).toBe(focusedWorkouts.length);
    expect(programs.length).toBeGreaterThanOrEqual(20);
    expect(focusedWorkouts.length).toBeGreaterThanOrEqual(25);
    // every level, including Pro, has programs to choose from
    for (const l of ['beginner', 'novice', 'intermediate', 'advanced', 'pro'] as const)
      expect(programs.filter((p) => p.levels.includes(l)).length, l).toBeGreaterThanOrEqual(4);
  });
  it('quick session moves exist', () => {
    for (const q of quickSessions) for (const m of q.moves) expect(exerciseById.has(m), `${q.id}: ${m}`).toBe(true);
  });
  it('every slot pattern has at least one exercise', () => {
    const patterns = new Set(exercises.map((e) => e.pattern));
    for (const p of programs) for (const d of p.days) for (const s of d.slots) expect(patterns.has(s.pattern), `${p.id}: ${s.pattern}`).toBe(true);
  });
});
