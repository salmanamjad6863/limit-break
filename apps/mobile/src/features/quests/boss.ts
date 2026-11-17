import type { BossResponse } from '@lb/contracts';
import { addDays, gameDate, shadowBoss, type BossMetrics, type HeroClass } from '@lb/engine';
import type { TrainingProfile } from '@lb/contracts';
import type { CompletedWorkout } from '@/features/training/store';
import type { DayRecord } from '@lb/engine';

const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));

function metrics(history: readonly CompletedWorkout[], days: Readonly<Record<string, DayRecord>>, from: string, to: string): BossMetrics {
  const inRange = history.filter((h) => h.date >= from && h.date <= to);
  return {
    hardSets: inRange.reduce((s, h) => s + h.workingSets, 0),
    volumeKg: Math.round(inRange.reduce((s, h) => s + h.volumeKg, 0)),
    cardioMin: Math.round(inRange.filter((h) => h.kind === 'quick').reduce((s, h) => s + h.minutes, 0)),
    questDays: Object.entries(days).filter(([d, r]) => d >= from && d <= to && r.dailyDone).length,
  };
}

/** Demo equivalent of GET /quests/boss (§4.7). */
export function localBoss(profile: TrainingProfile, heroClass: string | null, history: readonly CompletedWorkout[], days: Readonly<Record<string, DayRecord>>, claims: readonly string[]): BossResponse {
  const today = gameDate(new Date(), profile.timezone || 'UTC');
  const weekStart = mondayOf(today);
  const elapsed = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000 + 1;
  const current = metrics(history, days, weekStart, today);
  const pastStart = addDays(weekStart, -28);
  const past = metrics(history, days, pastStart, addDays(pastStart, elapsed - 1));
  const hasPast = past.hardSets + past.volumeKg + past.cardioMin + past.questDays > 0;
  const planned = { hardSets: Math.round((profile.daysPerWeek * 15 * elapsed) / 7), volumeKg: 0, cardioMin: 0, questDays: elapsed };
  const r = shadowBoss({ current, past: hasPast ? past : null, planned, heroClass: (heroClass ?? 'HYBRID') as HeroClass, experience: profile.experience });
  return { weekStart, ...r, claimed: claims.includes(weekStart), current, past: hasPast ? past : null };
}
