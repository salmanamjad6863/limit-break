/** Prints the level table for quick tuning: pnpm --filter @lb/engine simulate */
import { cumulativeXp, xpToNext } from '../src';
for (const l of [2, 5, 10, 25, 40, 50, 60, 80, 100]) {
  const total = cumulativeXp(l);
  console.log(`L${l}\ttotal=${total}\tnext=${xpToNext(l)}\tweeks@1600=${(total / 1600).toFixed(1)}\tweeks@1000=${(total / 1000).toFixed(1)}`);
}
