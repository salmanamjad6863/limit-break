import { Canvas, Circle, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '@/theme';

/** Quiet backdrop: near-black base with one soft accent glow at the top. */
export function ScreenBackground({ accent }: { accent?: string }) {
  const { width, height } = useWindowDimensions();
  const { c } = useTheme();
  const tint = accent ?? c.accent;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={height} color={c.background} />
      <Circle cx={width * 0.5} cy={-height * 0.08} r={width * 0.95}>
        <RadialGradient c={vec(width * 0.5, -height * 0.08)} r={width * 0.95} colors={[`${tint}2E`, `${tint}00`]} />
      </Circle>
    </Canvas>
  );
}
