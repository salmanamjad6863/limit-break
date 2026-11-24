import { View } from 'react-native';
import { TIER_METAL } from '@/ui/fx';

/** Four small bars (bronze → platinum), lit up to the earned tier; one gold bar for hidden achievements. */
export function TierPips({ count, earned }: { count: number; earned: number }) {
  const metals = count === 1 ? [TIER_METAL.gold] : [TIER_METAL.bronze, TIER_METAL.silver, TIER_METAL.gold, TIER_METAL.platinum];
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {metals.slice(0, count).map((m, i) => (
        <View key={i} style={{ width: 12, height: 4, borderRadius: 2, backgroundColor: i <= earned ? m.stops[1] : 'rgba(255,255,255,0.10)' }} />
      ))}
    </View>
  );
}
