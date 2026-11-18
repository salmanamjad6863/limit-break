import type { MeResponse } from '@lb/contracts';
import { ageOn, apBetween, levelFromXp } from '@lb/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

/**
 * Demo/offline mode stores the hunter on-device (no Supabase configured).
 * With a backend, the server is the source of truth and this stays empty.
 */
interface LocalHunterState {
  me: MeResponse | null;
  /** highest level AP was ever paid for (same rule as the server: no re-grants after edits/deletes) */
  apGrantedLevel?: number;
  setMe: (me: MeResponse) => void;
  reset: () => void;
}

export const useLocalHunter = create<LocalHunterState>()(
  persist(
    (set) => ({
      me: null,
      setMe: (me) => set({ me }),
      reset: () => set({ me: null, apGrantedLevel: undefined }),
    }),
    { name: 'lb-local-hunter', storage: createJSONStorage(() => zustandStorage) },
  ),
);

export const UNAWAKENED: MeResponse = {
  id: 'local',
  onboarded: false,
  hunterName: null,
  heroId: null,
  heroClass: null,
  state: null,
};

type HunterStats = NonNullable<MeResponse['state']>;

/**
 * Demo mirror of the server's XP write: new xp → level, and AP only for levels never reached before
 * (editing a workout down and back up, or deleting and re-finishing, never pays AP twice).
 */
export function applyLocalXp(state: HunterStats, xp: number): { state: HunterStats; from: number; to: number; ap: number } {
  const from = levelFromXp(state.xp);
  const to = levelFromXp(Math.max(0, xp));
  const paid = Math.max(state.level, useLocalHunter.getState().apGrantedLevel ?? state.level);
  const ap = to > paid ? apBetween(paid, to) : 0;
  if (to > paid) useLocalHunter.setState({ apGrantedLevel: to });
  return { state: { ...state, xp: Math.max(0, xp), level: to, apUnspent: state.apUnspent + ap }, from, to, ap };
}

/** Age in whole years from the nutrition birth date (same default and floor as the server's ageFrom). */
export function hunterAge(me: Pick<MeResponse, 'nutrition'> | null | undefined, now = new Date()): number {
  const birth = me?.nutrition?.birthDate;
  return birth ? Math.max(13, ageOn(birth, now.toISOString().slice(0, 10))) : 30;
}
