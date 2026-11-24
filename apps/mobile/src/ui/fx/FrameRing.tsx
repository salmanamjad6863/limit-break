import { BlurMask, Canvas, Circle, FillType, Group, LinearGradient, Path, Skia, SweepGradient, vec, type SkPath } from '@shopify/react-native-skia';
import { useMemo } from 'react';

export type FrameStyle = 'ring' | 'laurel' | 'crown' | 'flame' | 'crystal' | 'circuit' | 'halo' | 'thorns' | 'rivets';

const P = () => Skia.PathBuilder.Make();
const polar = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;

/** Leaf: a pointed ellipse from (x, y) along angle a. */
function leaf(p: ReturnType<typeof P>, x: number, y: number, a: number, len: number, w: number) {
  const [tx, ty] = [x + len * Math.cos(a), y + len * Math.sin(a)];
  const nx = -Math.sin(a) * w;
  const ny = Math.cos(a) * w;
  const [mx, my] = [(x + tx) / 2, (y + ty) / 2];
  p.moveTo(x, y);
  p.quadTo(mx + nx, my + ny, tx, ty);
  p.quadTo(mx - nx, my - ny, x, y);
  p.close();
}

/** Geometry for each style; everything sits between radius 0.40 and 0.5 of the box. */
function shapes(style: FrameStyle, size: number): { band: SkPath; detail: SkPath | null; accent: SkPath | null } {
  const c = size / 2;
  const R = size * 0.445;
  const band = P();
  band.addCircle(c, c, R);
  const detail = P();
  const accent = P();
  switch (style) {
    case 'laurel': {
      // two branches from the bottom up each side, leaves alternating in and out
      for (const side of [-1, 1]) {
        for (let i = 0; i < 9; i++) {
          const a = Math.PI / 2 + side * (0.25 + i * 0.27);
          const [x, y] = polar(c, c, R, a);
          const tangent = a + side * (Math.PI / 2);
          leaf(detail, x, y, tangent + 0.55 * side, size * 0.085, size * 0.022);
          leaf(detail, x, y, tangent - 0.35 * side - Math.PI * 0.12 * side, size * 0.07, size * 0.018);
        }
      }
      accent.addCircle(c, c + R, size * 0.025);
      break;
    }
    case 'crown': {
      // five points over the top of the ring, jewels on their tips
      const base = R * 0.97;
      const tip = R * 1.25;
      const span = 1.3;
      const n = 5;
      const start = -Math.PI / 2 - span / 2;
      for (let i = 0; i <= n * 2; i++) {
        const a = start + (span * i) / (n * 2);
        const [x, y] = polar(c, c, i % 2 === 0 ? base : tip, a);
        if (i === 0) detail.moveTo(x, y);
        else detail.lineTo(x, y);
        if (i % 2 === 1) {
          const [jx, jy] = polar(c, c, tip + size * 0.012, a);
          accent.addCircle(jx, jy, size * 0.016);
        }
      }
      detail.close();
      break;
    }
    case 'flame': {
      // tongues of fire licking outward, taller toward the top, alternating sizes
      const n = 20;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const w = 0.12;
        const h = size * (0.045 + 0.05 * Math.max(0, -Math.sin(a))) * (i % 2 ? 0.7 : 1);
        const [lx, ly] = polar(c, c, R - size * 0.01, a - w);
        const [rx, ry] = polar(c, c, R - size * 0.01, a + w);
        const [tx, ty] = polar(c, c, R + h, a + 0.05);
        const [c1x, c1y] = polar(c, c, R + h * 0.55, a - w * 0.9);
        const [c2x, c2y] = polar(c, c, R + h * 0.95, a - w * 0.15);
        const [c3x, c3y] = polar(c, c, R + h * 0.5, a + w * 0.5);
        const [c4x, c4y] = polar(c, c, R + h * 0.15, a + w * 1.05);
        detail.moveTo(lx, ly);
        detail.cubicTo(c1x, c1y, c2x, c2y, tx, ty);
        detail.cubicTo(c3x, c3y, c4x, c4y, rx, ry);
        detail.close();
      }
      break;
    }
    case 'crystal': {
      // a 12-sided gem ring with facet lines to the inner edge
      const n = 12;
      const inner = R * 0.9;
      for (const rr of [R * 1.06, inner]) {
        for (let i = 0; i <= n; i++) {
          const [x, y] = polar(c, c, rr, (i / n) * Math.PI * 2 - Math.PI / 2);
          if (i === 0) detail.moveTo(x, y);
          else detail.lineTo(x, y);
        }
        detail.close();
      }
      detail.setFillType(FillType.EvenOdd);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const [x1, y1] = polar(c, c, R * 1.06, a);
        const [x2, y2] = polar(c, c, inner, a + Math.PI / n);
        accent.moveTo(x1, y1);
        accent.lineTo(x2, y2);
      }
      break;
    }
    case 'circuit': {
      // tick segments and nodes like a circuit trace
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const long = i % 3 === 0;
        const [x1, y1] = polar(c, c, R, a);
        const [x2, y2] = polar(c, c, R + size * (long ? 0.04 : 0.02), a);
        detail.moveTo(x1, y1);
        detail.lineTo(x2, y2);
        if (long) accent.addCircle(x2, y2, size * 0.011);
      }
      break;
    }
    case 'thorns': {
      // uneven spikes, sharper on the lower half
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + (i % 2) * 0.05;
        const h = size * (0.03 + ((i * 7) % 5) * 0.006);
        const [lx, ly] = polar(c, c, R, a - 0.07);
        const [rx, ry] = polar(c, c, R, a + 0.07);
        const [tx, ty] = polar(c, c, R + h, a + 0.03);
        detail.moveTo(lx, ly);
        detail.lineTo(tx, ty);
        detail.lineTo(rx, ry);
        detail.close();
      }
      break;
    }
    case 'rivets': {
      for (let i = 0; i < 12; i++) {
        const [x, y] = polar(c, c, R, (i / 12) * Math.PI * 2);
        accent.addCircle(x, y, size * 0.018);
      }
      break;
    }
    case 'halo': {
      // four small star glints
      for (const a of [-Math.PI / 2, 0.35, Math.PI - 0.35, Math.PI / 2 + 0.9]) {
        const [x, y] = polar(c, c, R, a);
        const s = size * 0.03;
        accent.moveTo(x, y - s);
        accent.quadTo(x, y, x + s, y);
        accent.quadTo(x, y, x, y + s);
        accent.quadTo(x, y, x - s, y);
        accent.quadTo(x, y, x, y - s);
        accent.close();
      }
      break;
    }
    default:
      accent.addCircle(c, c, R * 0.94);
  }
  return { band: band.detach(), detail: detail.detach(), accent: accent.detach() };
}

const BAND_WIDTH: Record<FrameStyle, number> = { ring: 0.022, laurel: 0.014, crown: 0.022, flame: 0.02, crystal: 0.012, circuit: 0.016, halo: 0.034, thorns: 0.02, rivets: 0.05 };

/**
 * A profile frame drawn around the hunter sigil (procedural, no illustration needed): a metal band in the
 * frame's two colours plus its signature detail (laurel leaves, crown points, flames, facets, circuit nodes …).
 * Rendered as an overlay the same size as the sigil it frames.
 */
export function FrameRing({ style, colors, size }: { style: FrameStyle; colors: [string, string]; size: number }) {
  const { band, detail, accent } = useMemo(() => shapes(style, size), [style, size]);
  const c = size / 2;
  const [a, b] = colors;
  const sweep = [a, b, a, b, a];
  const strokeW = size * BAND_WIDTH[style];
  return (
    <Canvas style={{ position: 'absolute', width: size, height: size }} pointerEvents="none">
      {style === 'halo' ? (
        <Path path={band} style="stroke" strokeWidth={strokeW * 1.6} color={a} opacity={0.45}>
          <BlurMask blur={size * 0.03} style="normal" />
        </Path>
      ) : null}
      {/* fills behind the band (crown, gem, flames, thorns) */}
      {detail && (style === 'crown' || style === 'crystal' || style === 'flame' || style === 'thorns') ? (
        <Group>
          <Path path={detail}>
            <LinearGradient start={vec(0, 0)} end={vec(0, size)} colors={style === 'flame' ? [b, a] : [b, a]} />
          </Path>
          {style === 'crystal' ? <Path path={detail} style="stroke" strokeWidth={1} color={`${b}CC`} /> : null}
        </Group>
      ) : null}
      {/* the band */}
      <Path path={band} style="stroke" strokeWidth={strokeW}>
        <SweepGradient c={vec(c, c)} colors={sweep} />
      </Path>
      <Path path={band} style="stroke" strokeWidth={Math.max(0.75, strokeW * 0.2)} color="rgba(255,255,255,0.45)" />
      {/* line details on top (laurel, circuit) */}
      {detail && (style === 'laurel' || style === 'circuit') ? (
        style === 'laurel' ? (
          <Path path={detail}>
            <LinearGradient start={vec(0, size)} end={vec(0, 0)} colors={[a, b]} />
          </Path>
        ) : (
          <Path path={detail} style="stroke" strokeWidth={Math.max(1, size * 0.008)} color={b} />
        )
      ) : null}
      {accent ? (
        style === 'crystal' ? <Path path={accent} style="stroke" strokeWidth={0.75} color={`${b}88`} />
          : style === 'ring' ? <Path path={accent} style="stroke" strokeWidth={Math.max(0.75, size * 0.006)} color={`${b}66`} />
            : (
              <Path path={accent} color={style === 'rivets' ? 'rgba(15,18,28,0.75)' : style === 'halo' ? '#FFFFFF' : b}>
                {style === 'halo' || style === 'crown' ? <BlurMask blur={1.5} style="solid" /> : null}
              </Path>
            )
      ) : null}
      {style === 'rivets' ? (
        <>
          <Circle cx={c} cy={c} r={size * 0.445 - size * 0.025} style="stroke" strokeWidth={0.75} color="rgba(0,0,0,0.35)" />
          <Path path={accent!} style="stroke" strokeWidth={Math.max(0.75, size * 0.006)} color={b} />
        </>
      ) : null}
      {style === 'flame' && detail ? (
        <Path path={detail} color={a} opacity={0.35}>
          <BlurMask blur={size * 0.025} style="outer" />
        </Path>
      ) : null}
    </Canvas>
  );
}
