import { features } from '@lb/content';
import type { FeatureKey } from '@lb/contracts';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/features/session';
import { api, unwrap } from '@/lib/api';

type FeaturesResponse = {
  paywallEnabled: boolean;
  features: Record<FeatureKey, { tier: 'free' | 'premium'; enabled: boolean }>;
};

/**
 * SYSTEMS.md §7.1 — the ONLY way the app checks premium access.
 * The server decides; until it answers (or in demo mode) everything is enabled,
 * matching PAYWALL_ENABLED=false during the build.
 */
export function useFeature(key: FeatureKey): { enabled: boolean; tier: 'free' | 'premium' } {
  const status = useSession((s) => s.status);
  const { data } = useQuery({
    queryKey: ['features'],
    enabled: status === 'signedIn',
    queryFn: async () => unwrap<FeaturesResponse>(await api.features.$get()),
    staleTime: 5 * 60_000,
  });
  const entry = data?.features[key];
  return { enabled: entry?.enabled ?? true, tier: entry?.tier ?? features[key] };
}
