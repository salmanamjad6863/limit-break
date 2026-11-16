import { rankColor } from '@lb/tokens';
import { BlurMask, Canvas, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '../Text';

type Rank = keyof typeof rankColor;

/** Glowing hexagon badge in the rank's colour. */
export function RankBadge({ rank, size = 64 }: { rank: Rank; size?: number }) {
  const color = rankColor[rank];
  const hex = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    const cx = size / 2;
    const r = size * 0.34; // leaves room so the outer glow is never clipped
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const x = cx + r * Math.cos(a);
      const y = cx + r * Math.sin(a);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.close();
    return p.detach();
  }, [size]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Canvas style={{ position: 'absolute', width: size, height: size }}>
        <Path path={hex} color={color} opacity={0.5}>
          <BlurMask blur={size * 0.1} style="outer" />
        </Path>
        <Path path={hex}>
          <LinearGradient start={vec(0, 0)} end={vec(size, size)} colors={[`${color}55`, `${color}10`]} />
        </Path>
        <Path path={hex} style="stroke" strokeWidth={2} color={color} />
      </Canvas>
      <Text variant="title" color={color} style={{ fontSize: size * 0.34, lineHeight: size * 0.42, textShadowColor: color, textShadowRadius: 12 }}>
        {rank}
      </Text>
    </View>
  );
}
