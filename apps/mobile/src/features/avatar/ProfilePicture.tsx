import type { Cosmetic } from '@lb/content';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { Text } from '@/ui';
import { FrameRing, type FrameStyle } from '@/ui/fx';

/** Profile picture (photo or initial) inside the equipped frame. The frame sits in the outer ring, the picture inside it. */
export function ProfilePicture({ size, photo, initial, color, frame }: {
  size: number;
  photo: string | null;
  initial: string;
  color: string;
  frame?: Cosmetic | null;
}) {
  const framed = !!(frame?.style && frame.colors);
  const inner = framed ? size * 0.8 : size;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: inner, height: inner, borderRadius: inner / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
        borderWidth: framed ? 0 : 1.5, borderColor: `${color}80` }}>
        {photo ? (
          <Image source={{ uri: photo }} contentFit="cover" style={{ width: inner, height: inner }} accessibilityIgnoresInvertColors />
        ) : (
          <>
            <LinearGradient colors={[`${color}66`, `${color}14`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
            <Text variant="display" color="#FFFFFF" style={{ fontSize: inner * 0.42, lineHeight: inner * 0.5 }}>{initial}</Text>
          </>
        )}
      </View>
      {framed ? <FrameRing style={frame!.style as FrameStyle} colors={frame!.colors!} size={size} /> : null}
    </View>
  );
}
