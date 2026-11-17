import { describe, expect, it } from 'vitest';
import { buildFlow, buildQuestFlow, buildQuickSession, flowSeconds } from '../src';

describe('follow-along builders (VISUALS.md §4–5)', () => {
  it('per-side moves become left + right with a side switch', () => {
    const s = buildFlow([{ exerciseId: 'a', seconds: 30, perSide: true }], { canDo: () => true, safeSwaps: [] });
    expect(s.map((x) => `${x.kind}:${x.side ?? ''}`)).toEqual(['ready:', 'work:left', 'rest:right', 'work:right']);
  });
  it('drops optional moves you cannot do and swaps injured ones for safe moves', () => {
    const can = (id: string) => !['bands-move', 'knee-move'].includes(id);
    const s = buildFlow(
      [{ exerciseId: 'bands-move', seconds: 30, optional: true }, { exerciseId: 'knee-move', seconds: 45 }, { exerciseId: 'ok', seconds: 20 }],
      { canDo: can, safeSwaps: ['ok', 'cat-cow'] },
    );
    const work = s.filter((x) => x.kind === 'work').map((x) => x.exerciseId);
    expect(work).toEqual(['cat-cow', 'ok']); // 'ok' is used later, so the swap picks the next safe move
  });
  it('quick sessions: rounds × moves, no trailing rest', () => {
    const s = buildQuickSession({ moves: ['a', 'b'], work: 40, rest: 20, rounds: 2 });
    expect(s.filter((x) => x.kind === 'work')).toHaveLength(4);
    expect(s.at(-1)!.kind).toBe('work');
    expect(flowSeconds(s)).toBe(5 + 4 * 40 + 3 * 20);
  });
  it('quests: rep slots are open targets, timed slots count down, each reports its slot', () => {
    const s = buildQuestFlow([
      { exerciseId: 'push-up', target: 12, unit: 'reps' },
      { exerciseId: 'plank', target: 30, unit: 'sec' },
      { exerciseId: 'brisk-walk', target: 5, unit: 'min' },
    ]);
    const work = s.filter((x) => x.kind === 'work');
    expect(work.map((w) => [w.slotIndex, w.targetReps ?? null, w.seconds ?? null])).toEqual([[0, 12, null], [1, null, 30], [2, null, 300]]);
  });
});
