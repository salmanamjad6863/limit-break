/** Avatar Forge client (docs/AVATAR.md). */
import type { AvatarMeResponse, BuyCosmeticInput, CosmeticSlot, EquipCosmeticInput } from '@lb/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrapCommunity } from '@/features/community/api';
import { useSession } from '@/features/session';
import { api } from '@/lib/api';
import { newId } from '@/lib/id';

export const avatarKeys = {
  all: ['avatar'] as const,
  me: ['avatar', 'me'] as const,
};

const useOn = () => useSession((s) => s.status === 'signedIn');

export function useAvatarMe() {
  const on = useOn();
  return useQuery({
    queryKey: avatarKeys.me,
    enabled: on,
    staleTime: 30_000,
    queryFn: async () => unwrapCommunity<AvatarMeResponse>(await api.avatar.$get()),
  });
}

export function useEquipCosmetic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EquipCosmeticInput) =>
      unwrapCommunity<AvatarMeResponse>(await api.avatar.equip.$put({ json: input })),
    onSuccess: (d) => qc.setQueryData(avatarKeys.me, d),
  });
}

export function useBuyCosmetic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cosmeticId: string) =>
      unwrapCommunity<AvatarMeResponse>(
        await api.avatar.buy.$post({ json: { cosmeticId, spendId: newId() } satisfies BuyCosmeticInput }),
      ),
    onSuccess: (d) => qc.setQueryData(avatarKeys.me, d),
  });
}

export type { CosmeticSlot };
