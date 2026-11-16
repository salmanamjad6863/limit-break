/** Game day — SYSTEMS.md §0: the user's day rolls over at 03:00 local time. */
import { GAME_DAY_ROLLOVER_HOUR } from '../constants';

/** Returns YYYY-MM-DD of the game day for an instant in the given IANA timezone. */
export function gameDate(at: Date, timeZone: string): string {
  const shifted = new Date(at.getTime() - GAME_DAY_ROLLOVER_HOUR * 3_600_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
