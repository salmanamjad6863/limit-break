import { z } from 'zod';

export const QuestSlotDto = z.object({
  id: z.enum(['push', 'legs', 'core', 'cardio', 'ritual']),
  exerciseId: z.string(),
  target: z.number(),
  unit: z.enum(['reps', 'sec', 'min']),
});
export type QuestSlotDto = z.infer<typeof QuestSlotDto>;

export const QuestDto = z.object({
  id: z.string(),
  templateId: z.string(),
  kind: z.enum(['DAILY', 'PENALTY', 'SIDE', 'BOSS']),
  /** DAILY: the slots. PENALTY: options to pick from (one option = one or more slots). */
  slots: z.array(QuestSlotDto).default([]),
  options: z.array(z.array(QuestSlotDto)).default([]),
  /** slot index → amount done; PENALTY also stores the chosen option under "option" */
  progress: z.record(z.string(), z.number()),
  status: z.enum(['ACTIVE', 'COMPLETED', 'FAILED', 'EXPIRED']),
  completedAt: z.string().nullable(),
});
export type QuestDto = z.infer<typeof QuestDto>;

export const StreakDto = z.object({
  current: z.number().int(),
  longest: z.number().int(),
  shields: z.number().int(),
  penaltyDate: z.string().nullable(),
  sickToday: z.boolean(),
  sickAllowed: z.boolean(),
});
export type StreakDto = z.infer<typeof StreakDto>;

export const TodayQuestsResponse = z.object({
  date: z.string(),
  trainingDay: z.boolean(),
  daily: QuestDto,
  penalty: QuestDto.nullable(),
  sides: z.array(QuestDto),
  streak: StreakDto,
  scale: z.number(),
});
export type TodayQuestsResponse = z.infer<typeof TodayQuestsResponse>;

export const QuestProgressInput = z.object({
  progress: z.record(z.string(), z.number().min(0).max(100000)),
});
export type QuestProgressInput = z.infer<typeof QuestProgressInput>;

export const QuestProgressResponse = z.object({ quest: QuestDto, rewards: z.array(z.any()) });
export type QuestProgressResponse = z.infer<typeof QuestProgressResponse>;

export const ChooseSidesInput = z.object({ ids: z.array(z.string()).min(1).max(3) });
export const SickInput = z.object({ on: z.boolean() });

export const BossMetricsDto = z.object({ hardSets: z.number(), volumeKg: z.number(), cardioMin: z.number(), questDays: z.number() });
export const BossResponse = z.object({
  weekStart: z.string(),
  score: z.number(),
  required: z.number(),
  hpPct: z.number(),
  won: z.boolean(),
  prophecy: z.boolean(),
  claimed: z.boolean(),
  current: BossMetricsDto,
  past: BossMetricsDto.nullable(),
});
export type BossResponse = z.infer<typeof BossResponse>;

/** Which slots must be met: DAILY uses slots or (option 1 = Rest Ritual); PENALTY uses the chosen option. */
export function activeSlots(q: QuestDto): QuestSlotDto[] {
  const opt = q.progress.option;
  if (q.kind === 'PENALTY') return q.options[opt ?? 0] ?? [];
  if (q.kind === 'DAILY' && opt === 1 && q.options[0]) return q.options[0];
  return q.slots;
}

/** Shared by the API and the app so "complete" means the same thing everywhere. */
export function isQuestComplete(q: QuestDto): boolean {
  if (q.kind === 'SIDE' || q.kind === 'BOSS') return (q.progress.done ?? 0) >= 1;
  const slots = activeSlots(q);
  return slots.length > 0 && slots.every((s, i) => (q.progress[String(i)] ?? 0) >= s.target);
}

/** 0–1 completion across the active slots (for rings and bars). */
export function questRatio(q: QuestDto): number {
  if (q.kind === 'SIDE' || q.kind === 'BOSS') return Math.min(1, q.progress.done ?? 0);
  const slots = activeSlots(q);
  if (!slots.length) return 0;
  return slots.reduce((s, sl, i) => s + Math.min(1, (q.progress[String(i)] ?? 0) / sl.target), 0) / slots.length;
}
