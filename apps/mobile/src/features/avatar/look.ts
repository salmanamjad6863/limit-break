/**
 * "My look": the profile frame and aura around the hunter sigil. Signed in, the server owns inventory,
 * Essence and the loadout (/avatar); in demo mode the same rules run on the phone. Frames and auras are
 * earned from achievement tiers (never sold) or bought with Essence; some auras also need a rank.
 */
import { achievementById, cosmeticById, cosmetics, type Cosmetic } from '@lb/content';
import type { AvatarMeResponse, CosmeticSlot } from '@lb/contracts';
import { tierEssence, tierName } from '@lb/engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useAchievements } from '@/features/achievements/api';
import { useLocalHunter } from '@/features/progression/localHunter';
import { useSession } from '@/features/session/store';
import { useTraining } from '@/features/training/store';
import { api } from '@/lib/api';
import { newId } from '@/lib/id';
import { zustandStorage } from '@/lib/storage';
import { unwrapCommunity } from '@/features/community/api';
import { avatarKeys, useAvatarMe } from './api';

type LookSlot = Extract<CosmeticSlot, 'frame' | 'aura'>;
const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
const ESSENCE_PER_WORKOUT = 10;

interface LookLocalState {
  frame: string | null;
  aura: string | null;
  bought: string[];
  spent: number;
  set: (patch: Partial<Pick<LookLocalState, 'frame' | 'aura' | 'bought' | 'spent'>>) => void;
}

/** Demo mode only. */
export const useLookLocal = create<LookLocalState>()(
  persist((set) => ({ frame: 'frame-hunter', aura: 'aura-spirit', bought: [], spent: 0, set: (patch) => set(patch) }), {
    name: 'lb-look', storage: createJSONStorage(() => zustandStorage),
    partialize: (s) => ({ frame: s.frame, aura: s.aura, bought: s.bought, spent: s.spent }),
  }),
);

export interface LookItem {
  item: Cosmetic;
  owned: boolean;
  equipped: boolean;
  /** why it can't be had yet ("Earn Iron Will Gold", "Requires C-Rank") */
  lockedReason: string | null;
  /** 0–1 toward the achievement tier that unlocks it */
  progress: number | null;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const unlockLabel = (c: Cosmetic) => {
  const a = c.unlock ? achievementById.get(c.unlock.achievement) : null;
  if (!c.unlock || !a) return null;
  return a.hidden ? 'Earn a hidden achievement' : `Earn ${a.name} ${titleCase(tierName(a, c.unlock.tier))}`;
};

export function useMyLook() {
  const status = useSession((s) => s.status);
  const signedIn = status === 'signedIn';
  const remote = useAvatarMe();
  const ach = useAchievements().data;
  const local = useLookLocal();
  const history = useTraining((s) => s.history);
  const rank = useLocalHunter((s) => s.me?.state?.rank ?? 'E');
  const qc = useQueryClient();

  const earnedTier = (id: string) => ach?.progress.find((p) => p.id === id)?.earned ?? -1;
  const progressTo = (c: Cosmetic) => {
    if (!c.unlock) return null;
    const p = ach?.progress.find((x) => x.id === c.unlock!.achievement);
    if (!p) return 0;
    if (p.earned >= c.unlock.tier) return 1;
    // progress inside the current tier step, scaled to how many steps remain
    const steps = c.unlock.tier - p.earned;
    return Math.max(0, Math.min(1, p.ratio / steps));
  };

  let essence = 0;
  let items: LookItem[] = [];
  let frameId: string | null = null;
  let auraId: string | null = null;
  const looks = cosmetics.filter((c) => c.slot === 'frame' || c.slot === 'aura');

  if (signedIn && remote.data) {
    const d = remote.data;
    essence = d.essence;
    frameId = d.loadout.frame;
    auraId = d.loadout.aura;
    const dto = new Map(d.catalog.map((c) => [c.id, c]));
    items = looks.map((c) => {
      const x = dto.get(c.id);
      return { item: c, owned: !!x?.owned, equipped: !!x?.equipped, lockedReason: x?.owned ? null : x?.lockedReason ?? null, progress: progressTo(c) };
    });
  } else if (!signedIn) {
    const earnedEssence = (ach?.progress ?? []).reduce((s, p) => {
      const def = achievementById.get(p.id);
      let sum = 0;
      for (let i = 0; i <= p.earned && def; i++) sum += tierEssence(def, i);
      return s + sum;
    }, 0);
    essence = Math.max(0, history.filter((h) => h.source !== 'manual').length * ESSENCE_PER_WORKOUT + earnedEssence - local.spent);
    frameId = local.frame;
    auraId = local.aura;
    items = looks.map((c) => {
      const viaAchievement = !!c.unlock && earnedTier(c.unlock.achievement) >= c.unlock.tier;
      const owned = c.free || viaAchievement || local.bought.includes(c.id);
      const rankOk = !c.rankLock || RANKS.indexOf(rank) >= RANKS.indexOf(c.rankLock);
      const lockedReason = owned ? null : c.unlock ? unlockLabel(c) : !rankOk ? `Requires ${c.rankLock}-Rank` : null;
      return { item: c, owned, equipped: c.id === frameId || c.id === auraId, lockedReason, progress: progressTo(c) };
    });
  }

  const equip = useMutation({
    /** id null = none */
    mutationFn: async ({ slot, id }: { slot: LookSlot; id: string | null }) => {
      if (signedIn) return unwrapCommunity<AvatarMeResponse>(await api.avatar.equip.$put({ json: { slot, cosmeticId: id } }));
      useLookLocal.getState().set({ [slot]: id });
      return null;
    },
    // the sigil changes on tap; the server confirms
    onMutate: ({ slot, id }) => {
      const prev = qc.getQueryData<AvatarMeResponse>(avatarKeys.me);
      if (prev) {
        qc.setQueryData<AvatarMeResponse>(avatarKeys.me, {
          ...prev, loadout: { ...prev.loadout, [slot]: id },
          catalog: prev.catalog.map((c) => (c.slot === slot ? { ...c, equipped: c.id === id } : c)),
        });
      }
      return prev;
    },
    onError: (_e, _v, prev) => { if (prev) qc.setQueryData(avatarKeys.me, prev); },
    onSuccess: (d) => {
      if (d) qc.setQueryData(avatarKeys.me, d);
      void qc.invalidateQueries({ queryKey: ['community'] });
    },
  });

  const buy = useMutation({
    mutationFn: async (id: string) => {
      const c = cosmeticById.get(id);
      if (!c) throw new Error('unknown item');
      if (signedIn) return unwrapCommunity<AvatarMeResponse>(await api.avatar.buy.$post({ json: { cosmeticId: id, spendId: newId() } }));
      if (essence < c.price) throw new Error('Not enough Essence');
      const s = useLookLocal.getState();
      s.set({ bought: [...s.bought, id], spent: s.spent + c.price });
      return null;
    },
    onSuccess: (d) => { if (d) qc.setQueryData(avatarKeys.me, d); },
  });

  const byId = (id: string | null) => (id ? cosmeticById.get(id) ?? null : null);
  return {
    ready: signedIn ? !!remote.data : true,
    essence,
    frame: byId(frameId),
    aura: byId(auraId),
    items,
    equip,
    buy,
  };
}
