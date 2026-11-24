import type { Reward } from '@lb/contracts';
import { create } from 'zustand';

export type Celebration = Extract<Reward, { type: 'levelUp' | 'rankUp' | 'pr' | 'title' | 'challengeComplete' | 'achievement' }>;

interface CelebrationState {
  queue: Celebration[];
  enqueue: (items: readonly Reward[]) => void;
  dismiss: () => void;
}

const CINEMATIC: ReadonlySet<Reward['type']> = new Set(['levelUp', 'rankUp', 'pr', 'title', 'challengeComplete', 'achievement']);

/**
 * Rewards from the server land here; <CinematicOverlay> plays them ONE at a time,
 * so a level-up and a PR never fight for the screen (ARCHITECTURE.md §5.3).
 */
export const useCelebrations = create<CelebrationState>((set) => ({
  queue: [],
  enqueue: (items) =>
    set((s) => ({ queue: [...s.queue, ...(items.filter((r) => CINEMATIC.has(r.type)) as Celebration[])] })),
  dismiss: () => set((s) => ({ queue: s.queue.slice(1) })),
}));
