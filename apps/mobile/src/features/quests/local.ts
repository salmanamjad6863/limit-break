import { sideQuests } from '@lb/content';
import { activeSlots, isQuestComplete, type QuestDto, type Reward, type TodayQuestsResponse } from '@lb/contracts';
import {
  addDays, applyDailyCap, dailyQuestXp, defaultWeekdays, displayStreak, gameDate, generateDailyQuest,
  penaltyQuestOptions, resolveStreak, REST_RITUAL, sickAllowed, XP, type DayRecord, type HeroClass, type StreakState,
} from '@lb/engine';
import { applyLocalXp, useLocalHunter, useProgress } from '@/features/progression';
import { useTraining } from '@/features/training/store';
import type { FitnessTests, TrainingProfile } from '@lb/contracts';
import { newId } from '@/lib/id';
import { useQuestLocal } from './localStore';

const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const q = (templateId: string, kind: QuestDto['kind'], slots: QuestDto['slots'] = [], options: QuestDto['options'] = []): QuestDto => ({
  id: newId(), templateId, kind, slots, options, progress: {}, status: 'ACTIVE', completedAt: null,
});

export interface LocalQuestState {
  streak: StreakState;
  days: Record<string, DayRecord>;
  today: { date: string; trainingDay: boolean; daily: QuestDto; penalty: QuestDto | null; sides: QuestDto[] } | null;
  firstDay: string | null;
}

/**
 * Demo equivalent of GET /quests/today. PURE over the given state (safe under the React Compiler):
 * returns the response plus a `patch` to persist when the day rolled over or the streak resolved.
 */
export function localToday(
  profile: TrainingProfile,
  heroClass: string | null,
  state: LocalQuestState,
  tests: FitnessTests,
): { response: TodayQuestsResponse; patch: Partial<LocalQuestState> | null } {
  const today = gameDate(new Date(), profile.timezone || 'UTC');
  const yesterday = addDays(today, -1);
  const firstDay = state.firstDay ?? today;
  let streak = state.streak;
  let changed = state.firstDay == null;
  if (streak.lastResolved !== yesterday && firstDay <= yesterday) {
    streak = resolveStreak(streak, state.days, yesterday, firstDay).state;
    changed = true;
  }
  let t = state.today;
  if (!t || t.date !== today) {
    const trainingDay = (profile.weekdays ?? defaultWeekdays(profile.daysPerWeek)).includes(weekdayOf(today));
    const daily = q('daily', 'DAILY', generateDailyQuest({
      baselines: tests, experience: profile.experience, scale: streak.questScale, trainingDay,
      heroClass: (heroClass ?? 'HYBRID') as HeroClass, injuries: profile.injuries,
    }), trainingDay ? [] : [REST_RITUAL]);
    const penalty = streak.penaltyDate === yesterday ? q('penalty', 'PENALTY', [], penaltyQuestOptions({ scale: streak.questScale, injuries: profile.injuries })) : null;
    t = { date: today, trainingDay, daily, penalty, sides: [] };
    changed = true;
  }
  const rec = state.days[today];
  const response: TodayQuestsResponse = {
    date: today, trainingDay: t.trainingDay, daily: t.daily, penalty: t.penalty, sides: t.sides, scale: streak.questScale,
    streak: {
      current: displayStreak(streak, { dailyDone: t.daily.status === 'COMPLETED', penaltyDone: t.penalty?.status === 'COMPLETED' }),
      longest: Math.max(streak.longest, streak.streak + (t.daily.status === 'COMPLETED' ? 1 : 0)),
      shields: streak.shields, penaltyDate: streak.penaltyDate, sickToday: !!rec?.sick, sickAllowed: sickAllowed(streak.sickDates, today),
    },
  };
  return { response, patch: changed ? { streak, today: t, firstDay } : null };
}

/** Demo XP grant (same cap + level math as the server). */
export function grantLocalXp(amount: number, reason: string, timezone: string): Reward[] {
  const hunter = useLocalHunter.getState();
  const me = hunter.me;
  if (!me?.state || amount <= 0) return [];
  const t = useTraining.getState();
  const date = gameDate(new Date(), timezone || 'UTC');
  const cap = applyDailyCap(t.xpByDate[date] ?? 0, amount);
  const rewards: Reward[] = [];
  if (cap.granted > 0) {
    t.addXp(date, cap.granted);
    const next = applyLocalXp(me.state, me.state.xp + cap.granted);
    hunter.setMe({ ...me, state: next.state });
    rewards.push({ type: 'xp', amount: cap.granted, reason });
    if (next.to > next.from) rewards.push({ type: 'levelUp', from: next.from, to: next.to, ap: next.ap });
  }
  if (cap.dropped > 0) rewards.push({ type: 'capReached', dropped: cap.dropped });
  return rewards;
}

/** Demo equivalent of POST /quests/:id/progress. */
export function localProgress(questId: string, progress: Record<string, number>, timezone: string): { quest: QuestDto; rewards: Reward[] } {
  const s = useQuestLocal.getState();
  const t = s.today;
  if (!t) throw new Error('no quests today');
  const all = [t.daily, ...(t.penalty ? [t.penalty] : []), ...t.sides];
  const quest = all.find((x) => x.id === questId);
  if (!quest) throw new Error('quest not found');
  if (quest.status === 'COMPLETED') return { quest, rewards: [] };
  const merged = { ...quest.progress, ...progress };
  // never let progress exceed 3× target (plausibility, §4.8; same as the server)
  activeSlots({ ...quest, progress: merged }).forEach((sl, i) => { if (merged[String(i)] != null) merged[String(i)] = Math.min(merged[String(i)]!, sl.target * 3); });
  const next: QuestDto = { ...quest, progress: merged };
  const complete = isQuestComplete(next);
  if (complete) {
    next.status = 'COMPLETED';
    next.completedAt = new Date().toISOString();
  }
  const replace = (x: QuestDto) => (x.id === questId ? next : x);
  const today = { ...t, daily: replace(t.daily), penalty: t.penalty ? replace(t.penalty) : null, sides: t.sides.map(replace) };
  const days = { ...s.days };
  const rec = (days[t.date] = { ...(days[t.date] ?? { dailyDone: false, penaltyDone: false, sick: false }) });
  if (today.daily.status === 'COMPLETED') rec.dailyDone = true;
  if (today.penalty?.status === 'COMPLETED') rec.penaltyDone = true;
  s.set({ today, days });

  let rewards: Reward[] = [];
  if (complete) {
    const amount =
      quest.kind === 'DAILY' ? dailyQuestXp(s.streak.streak)
      : quest.kind === 'PENALTY' ? XP.penaltyQuest
      : today.sides.filter((x) => x.status === 'COMPLETED').length <= XP.sideQuestMaxPerDay ? XP.sideQuest : 0;
    rewards = [{ type: 'questComplete', questId: quest.templateId }, ...grantLocalXp(amount, `quest:${quest.templateId}`, timezone)];
  }
  return { quest: next, rewards };
}

export function localChooseSides(ids: string[]): QuestDto[] {
  const s = useQuestLocal.getState();
  if (!s.today) return [];
  if (s.today.sides.some((x) => x.status === 'COMPLETED')) throw new Error('locked');
  const valid = ids.filter((id) => sideQuests.some((x) => x.id === id)).slice(0, 3);
  const sides = valid.map((id) => s.today!.sides.find((x) => x.templateId === id) ?? q(id, 'SIDE'));
  s.set({ today: { ...s.today, sides } });
  return sides;
}

export function localSetSick(on: boolean) {
  const s = useQuestLocal.getState();
  if (!s.today) return;
  // same limit as the server: max 7 sick days per rolling 30
  if (on && !s.days[s.today.date]?.sick && !sickAllowed(s.streak.sickDates, s.today.date)) throw new Error('sick-mode limit reached (7 per 30 days)');
  const days = { ...s.days, [s.today.date]: { ...(s.days[s.today.date] ?? { dailyDone: false, penaltyDone: false, sick: false }), sick: on } };
  s.set({ days });
}
