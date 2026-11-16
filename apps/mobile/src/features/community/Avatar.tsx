import { rankColor } from '@lb/tokens';
import { View } from 'react-native';
import { Text } from '@/ui';
import type { Rank } from './demo';

/** Lightweight avatar for lists (the animated sigil is reserved for profiles). */
export function Avatar({ handle, color, rank, size = 40 }: { handle: string; color: string; rank?: Rank; size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
          backgroundColor: `${color}26`, borderWidth: 1.5, borderColor: `${color}80`,
        }}>
        <Text variant="heading" color={color} style={{ fontSize: size * 0.42, lineHeight: size * 0.52 }}>
          {handle.charAt(0).toUpperCase()}
        </Text>
      </View>
      {rank ? (
        <View
          style={{
            position: 'absolute', right: -3, bottom: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3,
            alignItems: 'center', justifyContent: 'center', backgroundColor: '#121219', borderWidth: 1.5, borderColor: rankColor[rank],
          }}>
          <Text variant="micro" color={rankColor[rank]} style={{ fontFamily: 'Inter_700Bold', fontSize: 10, lineHeight: 12 }}>{rank}</Text>
        </View>
      ) : null}
    </View>
  );
}
