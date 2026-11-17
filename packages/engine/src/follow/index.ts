/**
 * Follow-along step builders — VISUALS.md §4–5. Every guided experience (quests, quick sessions,
 * warm-ups, cool-downs) compiles to the same FollowStep[] the player runs.
 */
import type { QuestSlot } from '../quests';

export interface FollowStep {
  kind: 'ready' | 'work' | 'rest';
  exerciseId: string;
  /** timed work/rest */
  seconds?: number;
  /** rep-target work: open timer counting up until the target is reached */
  targetReps?: number;
  side?: 'left' | 'right';
  round?: number;
  rounds?: number;
  /** quest slot this work step reports back to */
  slotIndex?: number;
}

export interface FlowDef {
  exerciseId: string;
  seconds: number;
  perSide?: boolean;
  optional?: boolean;
}

const READY_SEC = 5;
const SWITCH_SIDE_SEC = 5;
const TRANSITION_SEC = 10;
const SEC_PER_REP = 3;

const ready = (exerciseId: string): FollowStep => ({ kind: 'ready', exerciseId, seconds: READY_SEC });

/**
 * Warm-up / cool-down (§5): per-side moves become left + right; moves the user can't do
 * (equipment) are dropped if optional, and moves conflicting with injuries swap to a safe move.
 */
export function buildFlow(
  defs: readonly FlowDef[],
  i: { canDo: (exerciseId: string) => boolean; safeSwaps: readonly string[] },
): FollowStep[] {
  const used = new Set<string>();
  const picked: FlowDef[] = [];
  defs.forEach((d, idx) => {
    const later = new Set(defs.slice(idx + 1).map((x) => x.exerciseId));
    if (i.canDo(d.exerciseId) && !used.has(d.exerciseId)) {
      picked.push(d);
      used.add(d.exerciseId);
      return;
    }
    if (d.optional) return;
    // prefer a safe move that isn't already planned later in this flow
    const swap = i.safeSwaps.find((s) => i.canDo(s) && !used.has(s) && !later.has(s)) ?? i.safeSwaps.find((s) => i.canDo(s) && !used.has(s));
    if (swap) {
      picked.push({ exerciseId: swap, seconds: d.seconds });
      used.add(swap);
    }
  });
  const steps: FollowStep[] = [];
  picked.forEach((d, k) => {
    if (k === 0) steps.push(ready(d.exerciseId));
    else steps.push({ kind: 'rest', exerciseId: d.exerciseId, seconds: TRANSITION_SEC });
    if (d.perSide) {
      steps.push({ kind: 'work', exerciseId: d.exerciseId, seconds: d.seconds, side: 'left' });
      steps.push({ kind: 'rest', exerciseId: d.exerciseId, seconds: SWITCH_SIDE_SEC, side: 'right' });
      steps.push({ kind: 'work', exerciseId: d.exerciseId, seconds: d.seconds, side: 'right' });
    } else steps.push({ kind: 'work', exerciseId: d.exerciseId, seconds: d.seconds });
  });
  return steps;
}

/** Quick sessions: rounds × moves with work/rest intervals; no rest after the very last move. */
export function buildQuickSession(q: { moves: readonly string[]; work: number; rest: number; rounds: number }): FollowStep[] {
  const steps: FollowStep[] = [ready(q.moves[0]!)];
  for (let r = 1; r <= q.rounds; r++) {
    q.moves.forEach((m, k) => {
      steps.push({ kind: 'work', exerciseId: m, seconds: q.work, round: r, rounds: q.rounds });
      const last = r === q.rounds && k === q.moves.length - 1;
      if (q.rest > 0 && !last) steps.push({ kind: 'rest', exerciseId: q.moves[(k + 1) % q.moves.length]!, seconds: q.rest, round: r, rounds: q.rounds });
    });
  }
  return steps;
}

/** Quests: seconds/minutes slots are timed; rep slots are "work until target" with a counter. */
export function buildQuestFlow(slots: readonly QuestSlot[] | readonly { exerciseId: string; target: number; unit: 'reps' | 'sec' | 'min' }[]): FollowStep[] {
  const steps: FollowStep[] = [];
  slots.forEach((s, slotIndex) => {
    steps.push(slotIndex === 0 ? ready(s.exerciseId) : { kind: 'rest', exerciseId: s.exerciseId, seconds: 20 });
    if (s.unit === 'reps') steps.push({ kind: 'work', exerciseId: s.exerciseId, targetReps: s.target, slotIndex });
    else steps.push({ kind: 'work', exerciseId: s.exerciseId, seconds: s.unit === 'min' ? s.target * 60 : s.target, slotIndex });
  });
  return steps;
}

/** Estimated duration (rep steps at 3 s/rep). */
export function flowSeconds(steps: readonly FollowStep[]): number {
  return steps.reduce((t, s) => t + (s.seconds ?? (s.targetReps ?? 0) * SEC_PER_REP), 0);
}

/** Seconds of real work in the steps completed so far (for XP: only real active time counts). */
export function workSeconds(steps: readonly FollowStep[], doneUpTo: number, spentInCurrent = 0): number {
  let t = 0;
  for (let k = 0; k < Math.min(doneUpTo, steps.length); k++) if (steps[k]!.kind === 'work') t += steps[k]!.seconds ?? (steps[k]!.targetReps ?? 0) * SEC_PER_REP;
  return t + (steps[doneUpTo]?.kind === 'work' ? spentInCurrent : 0);
}
