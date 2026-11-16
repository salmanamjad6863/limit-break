export const clamp = (x: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, x));

export const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? NaN : xs.reduce((s, x) => s + x, 0) / xs.length;

/** Ordinary least-squares slope of y over x. Returns NaN for < 2 points or zero x-variance. */
export function olsSlope(points: readonly { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) return NaN;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? NaN : num / den;
}

/** Piecewise-linear interpolation through sorted anchor points (x ascending). Clamped at ends. */
export function interpolate(anchors: readonly { x: number; y: number }[], x: number): number {
  if (anchors.length === 0) return NaN;
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]!;
    const b = anchors[i]!;
    if (x <= b.x) return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return last.y;
}

export const DAY_MS = 86_400_000;
