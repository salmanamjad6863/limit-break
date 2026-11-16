import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Animates a number from its previous value to `target` (ease-out). */
export function useCountUp(target: number, durationMs = 900, delayMs = 0): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  const from = useRef(reduce ? target : 0);

  useEffect(() => {
    if (reduce) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = from.current;
    let t0: number | null = null;
    const timer = setTimeout(() => {
      const step = (now: number) => {
        t0 ??= now;
        const p = Math.min(1, (now - t0) / durationMs);
        const v = start + (target - start) * easeOutCubic(p);
        setValue(v);
        if (p < 1) raf = requestAnimationFrame(step);
        else from.current = target;
      };
      raf = requestAnimationFrame(step);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, durationMs, delayMs, reduce]);

  return value;
}
