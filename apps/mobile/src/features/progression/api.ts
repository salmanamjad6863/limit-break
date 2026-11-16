import type { MeResponse } from '@lb/contracts';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/features/session';
import { api, unwrap } from '@/lib/api';
import { progressionKeys } from './keys';
import { UNAWAKENED, useLocalHunter } from './localHunter';

export function useMe() {
  const status = useSession((s) => s.status);
  const local = useLocalHunter((s) => s.me);
  const remote = useQuery({
    queryKey: progressionKeys.me(),
    enabled: status === 'signedIn',
    queryFn: async (): Promise<MeResponse> => unwrap<MeResponse>(await api.me.$get()),
  });
  if (status === 'demo') {
    return { data: local ?? UNAWAKENED, isLoading: false, error: null } as const;
  }
  return { data: remote.data, isLoading: remote.isLoading, error: remote.error } as const;
}
