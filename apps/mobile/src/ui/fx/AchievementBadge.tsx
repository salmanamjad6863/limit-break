import { BlurMask, Canvas, Circle, LinearGradient, Path, Skia, SweepGradient, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../Icon';
import { Text } from '../Text';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

/** Metal for the rosette (light → mid → deep) and the light the enamel centre takes. */
export const TIER_METAL: Record<BadgeTier, { stops: [string, string, string]; light: string; glow: string | null }> = {
  bronze: { stops: ['#F6C08F', '#C27A40', '#6E3A16'], light: '#F3B37A', glow: null },
  silver: { stops: ['#FFFFFF', '#C3CAD6', '#6B7383'], light: '#E6EBF3', glow: null },
  gold: { stops: ['#FFF4B8', '#F2C443', '#9A6408'], light: '#FFD866', glow: '#F5C542' },
  platinum: { stops: ['#E9FDFF', '#A9D8FF', '#8C7CFF'], light: '#C9EEFF', glow: '#8FD3FF' },
};
const LOCKED = { stops: ['#3A3848', '#26242F', '#17161D'] as [string, string, string], light: '#6D6B7D' };

/**
 * An achievement medal: a scalloped metal rosette by tier, a dark enamel centre holding the icon,
 * a soft glow for gold and platinum, and (while locked) a progress arc toward the first tier.
 * Pure vector, so it stays crisp from a 40 pt grid cell to the 160 pt celebration.
 */
export function AchievementBadge({
  tier, icon, size = 72, ratio = 0, hidden = false, dim = false,
}: {
  /** null = not earned yet */
  tier: BadgeTier | null;
  icon: IconName;
  size?: number;
  /** progress toward the first tier while locked (0–1) */
  ratio?: number;
  /** a hidden achievement not found yet: shows "?" */
  hidden?: boolean;
  /** earned but shown quieter (e.g. older tiers in a ladder) */
  dim?: boolean;
}) {
  const metal = tier ? TIER_METAL[tier] : null;
  const stops = metal?.stops ?? LOCKED.stops;
  const c = size / 2;
  const { rosette, arc, track } = useMemo(() => {
    const outer = size * 0.4;
    const inner = size * 0.365;
    const points = 28;
    const p = Skia.PathBuilder.Make();
    for (let i = 0; i <= points * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      const r = i % 2 === 0 ? outer : inner;
      const x = c + r * Math.cos(a);
      const y = c + r * Math.sin(a);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.close();
    const ring = size * 0.47;
    const oval = Skia.XYWHRect(c - ring, c - ring, ring * 2, ring * 2);
    const a = Skia.PathBuilder.Make();
    a.addArc(oval, -90, Math.max(0.001, Math.min(1, ratio)) * 360);
    const t = Skia.PathBuilder.Make();
    t.addCircle(c, c, ring);
    return { rosette: p.detach(), arc: a.detach(), track: t.detach() };
  }, [size, c, ratio]);

  const iconColor = tier ? metal!.light : LOCKED.light;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.55 : 1 }}>
      <Canvas style={{ position: 'absolute', width: size, height: size }}>
        {metal?.glow ? (
          <Path path={rosette} color={metal.glow} opacity={0.55}>
            <BlurMask blur={size * 0.08} style="outer" />
          </Path>
        ) : null}
        {!tier && ratio > 0 ? (
          <>
            <Path path={track} style="stroke" strokeWidth={Math.max(2, size * 0.035)} color="rgba(255,255,255,0.07)" />
            <Path path={arc} style="stroke" strokeWidth={Math.max(2, size * 0.035)} strokeCap="round" color="#7C5CFF" />
          </>
        ) : null}
        {/* metal rosette */}
        <Path path={rosette}>
          {tier === 'platinum' ? (
            <SweepGradient c={vec(c, c)} colors={['#E9FDFF', '#A9D8FF', '#C7B8FF', '#8C7CFF', '#A9F0FF', '#E9FDFF']} />
          ) : (
            <LinearGradient start={vec(0, 0)} end={vec(size, size)} colors={stops} />
          )}
        </Path>
        <Path path={rosette} style="stroke" strokeWidth={1} color="rgba(255,255,255,0.35)" />
        {/* bevel ring */}
        <Circle cx={c} cy={c} r={size * 0.315}>
          <LinearGradient start={vec(c, c - size * 0.32)} end={vec(c, c + size * 0.32)} colors={[stops[2], stops[0]]} />
        </Circle>
        {/* enamel centre */}
        <Circle cx={c} cy={c} r={size * 0.285}>
          <LinearGradient start={vec(c, c - size * 0.28)} end={vec(c, c + size * 0.28)} colors={tier ? ['#262236', '#121019'] : ['#1C1B24', '#101016']} />
        </Circle>
        <Circle cx={c} cy={c} r={size * 0.285} style="stroke" strokeWidth={Math.max(1, size * 0.012)} color={tier ? `${metal!.light}66` : 'rgba(255,255,255,0.06)'} />
        {/* specular highlight */}
        <Circle cx={c - size * 0.12} cy={c - size * 0.16} r={size * 0.1} color="rgba(255,255,255,0.10)">
          <BlurMask blur={size * 0.05} style="normal" />
        </Circle>
      </Canvas>
      {hidden && !tier ? (
        <Text variant="title" color={LOCKED.light} style={{ fontSize: size * 0.3, lineHeight: size * 0.36 }}>?</Text>
      ) : (
        <Icon name={icon} size={size * 0.3} color={iconColor} />
      )}
    </View>
  );
}
