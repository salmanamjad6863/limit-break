import { describe, expect, it } from 'vitest';
import { exerciseById, exercises, programs, quickSessions } from '../src';

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
  it('quick session moves exist', () => {
    for (const q of quickSessions) for (const m of q.moves) expect(exerciseById.has(m), `${q.id}: ${m}`).toBe(true);
  });
  it('every slot pattern has at least one exercise', () => {
    const patterns = new Set(exercises.map((e) => e.pattern));
    for (const p of programs) for (const d of p.days) for (const s of d.slots) expect(patterns.has(s.pattern), `${p.id}: ${s.pattern}`).toBe(true);
  });
});
