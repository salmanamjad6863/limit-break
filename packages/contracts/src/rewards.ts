import { z } from 'zod';
import { Rank } from './common';

export const Reward = z.discriminatedUnion('type', [
  z.object({ type: z.literal('xp'), amount: z.number().int(), reason: z.string() }),
  z.object({ type: z.literal('levelUp'), from: z.number().int(), to: z.number().int(), ap: z.number().int() }),
  z.object({ type: z.literal('rankUp'), from: Rank, to: Rank }),
  z.object({ type: z.literal('pr'), exerciseId: z.string(), e1rmKg: z.number() }),
  z.object({ type: z.literal('questComplete'), questId: z.string() }),
  z.object({ type: z.literal('title'), titleId: z.string() }),
  z.object({ type: z.literal('capReached'), dropped: z.number().int() }),
]);
export type Reward = z.infer<typeof Reward>;
