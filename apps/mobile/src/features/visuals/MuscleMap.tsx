import { Canvas, Group, Oval, RoundedRect } from '@shopify/react-native-skia';
import { Platform, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from '@/ui';

/**
 * Geometric front/back body map (VISUALS.md §2.1) coloured from exercise muscle tags.
 * Drawn in a 200×200 design space (front at x 0–100, back at x 100–200) and scaled to `width`.
 */
type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number }
  | { t: 'oval'; x: number; y: number; w: number; h: number };

const R = (x: number, y: number, w: number, h: number, r = 4): Shape => ({ t: 'rect', x, y, w, h, r });
const O = (x: number, y: number, w: number, h: number): Shape => ({ t: 'oval', x, y, w, h });
const mirror = (s: Shape, cx = 50): Shape => ({ ...s, x: 2 * cx - s.x - s.w });
const pair = (s: Shape, cx = 50) => [s, mirror(s, cx)];
const back = (s: Shape): Shape => ({ ...s, x: s.x + 100 });

/** Region → shapes. Front body centred at x=50, back body at x=150. */
const REGIONS: Record<string, Shape[]> = {
  upper_chest: pair(R(37, 30, 12, 7, 4)),
  chest: pair(R(37, 37, 12, 10, 5)),
  front_delts: pair(O(26, 29, 11, 11)),
  side_delts: pair(O(22, 33, 7, 10)),
  biceps: pair(R(23, 44, 8, 15, 4)),
  forearms: pair(R(20, 61, 8, 18, 4)),
  core: [R(44, 49, 12, 30, 5)],
  obliques: pair(R(37, 51, 6, 24, 3)),
  hip_flexors: pair(R(41, 80, 8, 7, 3)),
  quads: pair(R(38, 89, 11, 36, 6)),
  calves_front: pair(R(40, 131, 8, 28, 4)),
  // back view
  traps: [back(R(42, 24, 16, 12, 5))],
  upper_back: [back(R(40, 36, 20, 10, 4))],
  rear_delts: pair(back(O(26, 29, 11, 11)), 150),
  lats: pair(back(R(36, 45, 10, 22, 5)), 150),
  triceps: pair(back(R(23, 44, 8, 15, 4)), 150),
  forearms_back: pair(back(R(20, 61, 8, 18, 4)), 150),
  lower_back: [back(R(44, 67, 12, 12, 4))],
  glutes: pair(back(R(38, 80, 12, 15, 6)), 150),
  hamstrings: pair(back(R(38, 97, 11, 28, 6)), 150),
  calves: pair(back(R(40, 131, 8, 26, 5)), 150),
};

/** Muscle tags in content → regions (aliases for broad tags). */
const ALIASES: Record<string, string[]> = {
  full_body: Object.keys(REGIONS),
  shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  rotator_cuff: ['rear_delts'],
  spine: ['lower_back', 'upper_back'],
  hips: ['glutes', 'hip_flexors'],
  ankles: ['calves', 'calves_front'],
  calves: ['calves', 'calves_front'],
  forearms: ['forearms', 'forearms_back'],
};
const regionsFor = (tag: string) => ALIASES[tag] ?? (REGIONS[tag] ? [tag] : []);

/** Silhouette shapes drawn underneath in the neutral tone. */
const SILHOUETTE: Shape[] = [
  ...[0, 100].flatMap((dx) => [
    { t: 'oval' as const, x: 41 + dx, y: 6, w: 18, h: 18 },
    R(46 + dx, 22, 8, 6, 2),
    R(35 + dx, 28, 30, 54, 10),
    ...pair(R(20 + dx, 30, 12, 50, 6), 50 + dx),
    ...pair(R(37 + dx, 82, 13, 80, 7), 50 + dx),
  ]),
];

function draw(s: Shape, color: string, k: string) {
  return s.t === 'oval' ? (
    <Oval key={k} x={s.x} y={s.y} width={s.w} height={s.h} color={color} />
  ) : (
    <RoundedRect key={k} x={s.x} y={s.y} width={s.w} height={s.h} r={s.r ?? 4} color={color} />
  );
}

/** Below this width the map renders with plain views instead of a Skia canvas. */
const THUMB_MAX = 100;

function box(s: Shape, k: number, color: string, key: string) {
  const w = s.w * k;
  const h = s.h * k;
  return (
    <View key={key} style={{
      position: 'absolute', left: s.x * k, top: s.y * k, width: w, height: h, backgroundColor: color,
      borderRadius: s.t === 'oval' ? Math.min(w, h) / 2 : (s.r ?? 4) * k,
    }} />
  );
}

/** The view (front or back) that shows more of these muscles: single-figure thumbnails use it. */
export function bestSide(primary: readonly string[]): 'front' | 'back' {
  let front = 0;
  let backN = 0;
  for (const r of primary.flatMap(regionsFor)) for (const s of REGIONS[r] ?? []) (s.x >= 100 ? backN++ : front++);
  return backN > front ? 'back' : 'front';
}

export function MuscleMap({
  primary,
  secondary = [],
  width = 200,
  showLabels = true,
  side = 'both',
}: {
  primary: readonly string[];
  secondary?: readonly string[];
  width?: number;
  showLabels?: boolean;
  /** one figure only (thumbnails, posters); `width` is then the width of that one figure */
  side?: 'both' | 'front' | 'back';
}) {
  const { c } = useTheme();
  const single = side !== 'both';
  const scale = width / (single ? 100 : 200);
  const height = 170 * scale;
  const prim = new Set(primary.flatMap(regionsFor));
  const sec = new Set(secondary.flatMap(regionsFor).filter((r) => !prim.has(r)));
  // single figure: keep that half of the design space and shift it to x 0–100
  const dx = side === 'back' ? -100 : 0;
  const keep = (s: Shape) => !single || (side === 'back' ? s.x >= 100 : s.x < 100);
  const at = (s: Shape): Shape => (dx ? { ...s, x: s.x + dx } : s);
  const silhouette = SILHOUETTE.filter(keep).map(at);
  const regions = Object.entries(REGIONS).map(([name, shapes]) => [name, shapes.filter(keep).map(at)] as const);
  const singleLabel = side === 'back' ? 'Back' : 'Front';
  return (
    <View style={{ alignItems: 'center', gap: 4 }} accessibilityRole="image"
      accessibilityLabel={`Muscles worked: ${primary.join(', ').replace(/_/g, ' ')}${secondary.length ? `; also ${secondary.join(', ').replace(/_/g, ' ')}` : ''}`}>
      {width <= THUMB_MAX ? (
        // thumbnails: plain views, no GPU surface (lists of maps stay smooth on low-end Android)
        <View style={{ width, height }}>
          {silhouette.map((s, i) => box(s, scale, 'rgba(255,255,255,0.06)', `s${i}`))}
          {regions.flatMap(([name, shapes]) =>
            shapes.map((s, i) => box(s, scale, prim.has(name) ? c.accent : sec.has(name) ? `${c.accent}66` : 'rgba(255,255,255,0.09)', `${name}${i}`)),
          )}
        </View>
      ) : (
        /* static drawing: on web, free the WebGL context after painting (browsers cap live contexts at ~16) */
        <Canvas style={{ width, height }} __destroyWebGLContextAfterRender={Platform.OS === 'web'}>
          <Group transform={[{ scale }]}>
            {silhouette.map((s, i) => draw(s, 'rgba(255,255,255,0.06)', `s${i}`))}
            {regions.flatMap(([name, shapes]) =>
              shapes.map((s, i) => draw(s, prim.has(name) ? c.accent : sec.has(name) ? `${c.accent}66` : 'rgba(255,255,255,0.09)', `${name}${i}`)),
            )}
          </Group>
        </Canvas>
      )}
      {showLabels ? (
        <View style={{ flexDirection: 'row', width, justifyContent: 'space-around' }}>
          {single ? <Text variant="micro" muted>{singleLabel}</Text> : (
            <>
              <Text variant="micro" muted>Front</Text>
              <Text variant="micro" muted>Back</Text>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}
