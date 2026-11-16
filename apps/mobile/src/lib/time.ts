import { GAME_DAY_ROLLOVER_HOUR } from '@lb/engine';
import { useEffect, useState } from 'react';

/** Milliseconds until the next game-day rollover (03:00 local, SYSTEMS.md §0). */
export function msUntilRollover(now = new Date()): number {
  const next = new Date(now);
  next.setHours(GAME_DAY_ROLLOVER_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function formatHms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Live countdown to the Daily Quest deadline, refreshed every 30 s. */
export function useQuestDeadline(): string {
  const [left, setLeft] = useState(() => msUntilRollover());
  useEffect(() => {
    const id = setInterval(() => setLeft(msUntilRollover()), 30_000);
    return () => clearInterval(id);
  }, []);
  return formatHms(left);
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
