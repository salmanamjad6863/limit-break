export * from './rig';
import { ANIMS, IDLE } from './anims';
import { bake, type Baked } from './rig';

export { ANIMS, IDLE };

const cache = new Map<string, Baked>();
/** Baked trainer animation for an exercise (cached), or null if none exists. */
export function trainerAnimation(exerciseId: string): Baked | null {
  const anim = exerciseId === 'idle' ? IDLE : ANIMS[exerciseId];
  if (!anim) return null;
  let b = cache.get(exerciseId);
  if (!b) cache.set(exerciseId, (b = bake(anim)));
  return b;
}
