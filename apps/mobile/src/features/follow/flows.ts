import { flows } from '@lb/content';
import { buildFlow, canPerform, type FollowStep } from '@lb/engine';
import type { TrainingProfile } from '@lb/contracts';
import { exerciseById } from '@/features/training/catalog';

export type Focus = 'upper' | 'lower' | 'full';

const UPPER = /push|pull|elbow|shoulder|rear_delt|vertical_push_dip/;
const LOWER = /squat|hinge|lunge|hip_thrust|knee_flexion|calf/;

/** Which warm-up fits a workout: mostly upper patterns → upper, mostly lower → lower, else full. */
export function focusOf(exerciseIds: readonly string[]): Focus {
  let up = 0;
  let low = 0;
  for (const id of exerciseIds) {
    const p = exerciseById.get(id)?.pattern ?? '';
    if (UPPER.test(p)) up++;
    else if (LOWER.test(p)) low++;
  }
  if (up + low === 0) return 'full';
  if (up / (up + low) >= 0.7) return 'upper';
  if (low / (up + low) >= 0.7) return 'lower';
  return 'full';
}

/** Guided warm-up / cool-down for this hunter's equipment and injuries (VISUALS.md §5). */
export function guidedFlow(kind: 'warmup' | 'cooldown', focus: Focus, profile: TrainingProfile): FollowStep[] {
  const canDo = (id: string) => {
    const e = exerciseById.get(id);
    return !!e && canPerform(e, profile);
  };
  return buildFlow(flows[kind][focus], { canDo, safeSwaps: flows.safeSwaps });
}
