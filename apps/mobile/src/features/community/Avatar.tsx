import { cosmeticById } from '@lb/content';
import { rankColor } from '@lb/tokens';
import { View } from 'react-native';
import { Text } from '@/ui';
import type { Rank } from './demo';

/** Lightweight avatar for lists (the animated sigil is reserved for profiles). */
export function Avatar({ handle, color, rank, size = 40, frame, aura }: {
  handle: string; color: string; rank?: Rank; size?: number;
  /** equipped frame / aura cosmetic ids: a two-tone ring and a tinted glow (no canvas, so lists stay light) */
  frame?: string | null; aura?: string | null;
}) {
  const f = frame ? cosmeticById.get(frame) : null;
  const a = aura ? cosmeticById.get(aura) : null;
  const ring = f?.colors && f.id !== 'frame-hunter' ? f.colors : null;
  const glow = a?.colors?.[0] ?? null;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
          backgroundColor: glow ? `${glow}30` : `${color}26`,
          borderWidth: ring ? Math.max(2, size * 0.06) : 1.5, borderColor: ring ? ring[0] : `${color}80`,
          ...(glow ? { shadowColor: glow, shadowOpacity: 0.7, shadowRadius: size * 0.18, shadowOffset: { width: 0, height: 0 } } : {}),
        }}>
        {ring ? <View style={{ position: 'absolute', inset: 1, borderRadius: size / 2, borderWidth: 1, borderColor: `${ring[1]}AA` }} /> : null}
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
