import { activeSlots, isQuestComplete, type BossResponse, type QuestDto, type QuestProgressResponse, type QuestSlotDto, type TodayQuestsResponse } from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import {
  addDays, dailyQuestXp, defaultWeekdays, displayStreak, gameDate, generateDailyQuest, penaltyQuestOptions, resolveStreak,
  GAME_DAY_ROLLOVER_HOUR, REST_RITUAL, shadowBoss, sickAllowed, XP, type DayRecord, type HeroClass, type StreakState,
} from '@lb/engine';
import { sideQuests } from '@lb/content';
import { mergeTests } from '../progression/service';
import { grantXp } from '../progression/xp';
import { isUniqueViolation } from '../../lib/db';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

export class QuestError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const mondayOf = (iso: string) => addDays(iso, -((weekdayOf(iso) + 6) % 7));

type Row = { id: string; templateId: string; kind: string; targets: unknown; progress: unknown; status: string; completedAt: Date | null };

export function toDto(q: Row): QuestDto {
  const t = (q.targets ?? {}) as { slots?: QuestSlotDto[]; options?: QuestSlotDto[][] };
  const kind = q.kind === 'PENALTY' ? 'PENALTY' : q.kind === 'SIDE' ? 'SIDE' : q.kind === 'BOSS' ? 'BOSS' : 'DAILY';
  return {
    id: q.id, templateId: q.templateId, kind, slots: t.slots ?? [], options: t.options ?? [],
    progress: (q.progress ?? {}) as Record<string, number>, status: q.status as QuestDto['status'], completedAt: q.completedAt?.toISOString() ?? null,
  };
}

export const isComplete = isQuestComplete;

function streakStateOf(s: Record<string, any>): StreakState {
  return {
    streak: s.streak, longest: s.longest, shields: s.shields, shieldsMonth: s.shieldsMonth ?? null, penaltyDate: s.penaltyDate ?? null,
    lastResolved: s.lastResolved ?? null, sickDates: s.sickDates ?? [], questScale: s.questScale ?? 0.6, consecutiveFails: s.consecutiveFails ?? 0,
  };
}

/** Resolve the streak through yesterday, create today's quests if missing, return everything for the Quests screen. */
export async function getToday(prisma: PrismaClient, userId: string, now = new Date()): Promise<TodayQuestsResponse> {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({ where: { id: userId } });
    let state = await tx.hunterState.findUnique({ where: { userId } });
    if (!profile || !state) throw new QuestError(404, 'profile not onboarded');
    const tz = profile.timezone;
    const today = gameDate(now, tz);
    const yesterday = addDays(today, -1);
    const firstDay = gameDate(profile.onboardedAt ?? profile.createdAt, tz);

    // 1. streak resolution (idempotent)
    const st0 = streakStateOf(state);
    if (st0.lastResolved !== yesterday && firstDay <= yesterday) {
      const from = st0.lastResolved ? addDays(st0.lastResolved, 1) : firstDay;
      const past = await tx.questInstance.findMany({ where: { userId, localDate: { gte: from, lte: yesterday } } });
      const records: Record<string, DayRecord> = {};
      for (const q of past) {
        const r = (records[q.localDate] ??= { dailyDone: false, penaltyDone: false, sick: false });
        if (q.templateId === 'sick') r.sick = true;
        else if (q.kind === 'DAILY' && q.status === 'COMPLETED') r.dailyDone = true;
        else if (q.kind === 'PENALTY' && q.status === 'COMPLETED') r.penaltyDone = true;
      }
      const { state: next } = resolveStreak(st0, records, yesterday, firstDay);
      await tx.hunterState.update({
        where: { userId },
        data: {
          streak: next.streak, longest: next.longest, shields: next.shields, shieldsMonth: next.shieldsMonth, penaltyDate: next.penaltyDate,
          lastResolved: next.lastResolved, sickDates: next.sickDates, questScale: next.questScale, consecutiveFails: next.consecutiveFails,
        },
      });
      state = (await tx.hunterState.findUnique({ where: { userId } }))!;
    }
    const st = streakStateOf(state);

    // 2. today's quests
    const weekdays = profile.trainingWeekdays?.length ? profile.trainingWeekdays : defaultWeekdays(profile.daysPerWeek ?? 3);
    const trainingDay = weekdays.includes(weekdayOf(today));
    const attempts = await tx.trialAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { results: true } });
    const slots = generateDailyQuest({
      baselines: mergeTests(profile.baselines, attempts), experience: (profile.experience ?? 'beginner') as 'beginner',
      scale: st.questScale, trainingDay, heroClass: (profile.heroClass ?? 'HYBRID') as HeroClass, injuries: profile.injuries,
    });
    const dueAt = new Date(`${addDays(today, 1)}T03:00:00Z`);
    const wanted = [
      { templateId: 'daily', kind: 'DAILY' as const, targets: { slots, options: trainingDay ? [] : [REST_RITUAL] } },
      ...(st.penaltyDate === yesterday ? [{ templateId: 'penalty', kind: 'PENALTY' as const, targets: { slots: [], options: penaltyQuestOptions({ scale: st.questScale, injuries: profile.injuries }) } }] : []),
    ];
    const existing = await tx.questInstance.findMany({ where: { userId, localDate: today } });
    for (const w of wanted) {
      if (!existing.some((e) => e.templateId === w.templateId)) {
        const created = await tx.questInstance.create({
          data: { id: crypto.randomUUID(), userId, templateId: w.templateId, kind: w.kind, localDate: today, targets: w.targets as never, progress: {}, dueAt },
        });
        existing.push(created);
      }
    }
    const daily = toDto(existing.find((e) => e.templateId === 'daily')!);
    const penalty = existing.find((e) => e.templateId === 'penalty');
    const sick = existing.some((e) => e.templateId === 'sick');
    return {
      date: today,
      trainingDay,
      daily,
      penalty: penalty ? toDto(penalty) : null,
      sides: existing.filter((e) => e.kind === 'SIDE').map(toDto),
      streak: {
        current: displayStreak(st, { dailyDone: daily.status === 'COMPLETED', penaltyDone: penalty?.status === 'COMPLETED' }),
        longest: Math.max(st.longest, st.streak + (daily.status === 'COMPLETED' ? 1 : 0)),
        shields: st.shields, penaltyDate: st.penaltyDate, sickToday: sick, sickAllowed: sickAllowed(st.sickDates, today),
      },
      scale: st.questScale,
    };
  });
}

/** Offline progress for yesterday's quest is still accepted until 12:00 local the next day (if the day isn't resolved yet). */
export const QUEST_GRACE_UNTIL_HOUR = 12;

/** Records progress; on completion grants XP once (daily 50 + streak bonus, penalty 20, side 15 × max 3/day). */
export async function updateQuest(prisma: PrismaClient, userId: string, questId: string, progress: Record<string, number>, now = new Date()): Promise<QuestProgressResponse> {
  try {
    return await updateQuestTx(prisma, userId, questId, progress, now);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // a concurrent request completed (and paid) this quest first: answer like the duplicate it is
    const q = await prisma.questInstance.findFirst({ where: { id: questId, userId } });
    if (!q) throw e;
    return { quest: toDto(q), rewards: [] };
  }
}

async function updateQuestTx(prisma: PrismaClient, userId: string, questId: string, progress: Record<string, number>, now: Date): Promise<QuestProgressResponse> {
  return prisma.$transaction(async (tx) => {
    const q = await tx.questInstance.findFirst({ where: { id: questId, userId } });
    if (!q) throw new QuestError(404, 'quest not found');
    const profile = await tx.profile.findUnique({ where: { id: userId } });
    const tz = profile?.timezone ?? 'UTC';
    const today = gameDate(now, tz);
    if (q.localDate !== today) {
      // progress queued offline across the 03:00 rollover: yesterday's quest still counts while that day
      // hasn't been resolved into the streak yet, until midday
      const state = await tx.hunterState.findUnique({ where: { userId } });
      const graceDay = gameDate(new Date(now.getTime() - (QUEST_GRACE_UNTIL_HOUR - GAME_DAY_ROLLOVER_HOUR) * 3_600_000), tz);
      const unresolved = !state?.lastResolved || state.lastResolved < q.localDate;
      if (!(q.localDate === addDays(today, -1) && graceDay === q.localDate && unresolved)) throw new QuestError(409, 'quest expired');
    }
    const day = q.localDate;
    if (q.status === 'COMPLETED') return { quest: toDto(q), rewards: [] };

    const merged = { ...((q.progress ?? {}) as Record<string, number>), ...progress };
    const dto = toDto({ ...q, progress: merged });
    // never let progress exceed 3× target (plausibility, §4.8)
    activeSlots(dto).forEach((s, i) => { if (merged[String(i)] != null) merged[String(i)] = Math.min(merged[String(i)]!, s.target * 3); });
    const complete = isComplete({ ...dto, progress: merged });
    const updated = await tx.questInstance.update({
      where: { id: q.id },
      data: { progress: merged, status: complete ? 'COMPLETED' : 'ACTIVE', completedAt: complete ? new Date() : null },
    });
    let rewards: unknown[] = [];
    if (complete) {
      const state = await tx.hunterState.findUnique({ where: { userId } });
      let amount = 0;
      if (q.kind === 'DAILY') amount = dailyQuestXp(state?.streak ?? 0);
      else if (q.kind === 'PENALTY') amount = XP.penaltyQuest;
      else if (q.kind === 'SIDE') {
        const doneSides = await tx.questInstance.count({ where: { userId, localDate: day, kind: 'SIDE', status: 'COMPLETED' } });
        amount = doneSides <= XP.sideQuestMaxPerDay ? XP.sideQuest : 0;
      }
      await tx.event.create({ data: { id: q.id, userId, type: `quest.${q.kind.toLowerCase()}.completed`, localDate: day, clientTs: now, payload: { templateId: q.templateId } } });
      rewards = await grantXp(tx, { userId, eventId: q.id, localDate: day, amount, reason: `quest:${q.templateId}` });
      rewards.unshift({ type: 'questComplete', questId: q.templateId });
    }
    return { quest: toDto(updated), rewards };
  });
}

export async function chooseSides(prisma: PrismaClient, userId: string, ids: string[]): Promise<QuestDto[]> {
  const valid = ids.filter((id) => sideQuests.some((s) => s.id === id)).slice(0, XP.sideQuestMaxPerDay);
  if (!valid.length) throw new QuestError(400, 'unknown side quests');
  return prisma.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({ where: { id: userId } });
    const today = gameDate(new Date(), profile?.timezone ?? 'UTC');
    const current = await tx.questInstance.findMany({ where: { userId, localDate: today, kind: 'SIDE' } });
    if (current.some((q) => q.status === 'COMPLETED')) throw new QuestError(409, 'side quests locked after the first completion');
    for (const q of current) if (!valid.includes(q.templateId)) await tx.questInstance.delete({ where: { id: q.id } });
    const out = [];
    for (const id of valid) {
      const found = current.find((q) => q.templateId === id);
      out.push(
        found ??
          (await tx.questInstance.create({
            data: { id: crypto.randomUUID(), userId, templateId: id, kind: 'SIDE', localDate: today, targets: {}, progress: {}, dueAt: new Date(`${addDays(today, 1)}T03:00:00Z`) },
          })),
      );
    }
    return out.map(toDto);
  });
}

/** Sick/Injury Mode for today (freezes the streak; max 7 per rolling 30 days). */
export async function setSick(prisma: PrismaClient, userId: string, on: boolean) {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({ where: { id: userId } });
    const state = await tx.hunterState.findUnique({ where: { userId } });
    const today = gameDate(new Date(), profile?.timezone ?? 'UTC');
    const existing = await tx.questInstance.findFirst({ where: { userId, localDate: today, templateId: 'sick' } });
    if (on && !existing) {
      if (!sickAllowed(state?.sickDates ?? [], today)) throw new QuestError(409, 'sick-mode limit reached (7 per 30 days)');
      await tx.questInstance.create({
        data: { id: crypto.randomUUID(), userId, templateId: 'sick', kind: 'DAILY', localDate: today, targets: {}, progress: {}, status: 'COMPLETED', dueAt: new Date() },
      });
    } else if (!on && existing) await tx.questInstance.delete({ where: { id: existing.id } });
    return { on };
  });
}

/** Shadow-Self boss (§4.7): this week so far vs the same days 4 weeks ago. */
export async function getBoss(prisma: PrismaClient, userId: string, now = new Date()): Promise<BossResponse> {
  const profile = await prisma.profile.findUnique({ where: { id: userId } });
  if (!profile) throw new QuestError(404, 'profile not onboarded');
  const today = gameDate(now, profile.timezone);
  const weekStart = mondayOf(today);
  const elapsed = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000 + 1;
  const metrics = async (from: string, to: string) => {
    const sessions = await prisma.workoutSession.findMany({ where: { userId, localDate: { gte: from, lte: to } }, select: { id: true, cardioMinutes: true } });
    const sets = sessions.length
      ? await prisma.workoutSet.findMany({ where: { sessionId: { in: sessions.map((s) => s.id) }, isWarmup: false }, select: { reps: true, weightKg: true } })
      : [];
    const questDays = await prisma.questInstance.count({ where: { userId, kind: 'DAILY', status: 'COMPLETED', templateId: 'daily', localDate: { gte: from, lte: to } } });
    return {
      hardSets: sets.length,
      volumeKg: Math.round(sets.reduce((v, s) => v + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
      cardioMin: Math.round(sessions.reduce((m, s) => m + s.cardioMinutes, 0)),
      questDays,
    };
  };
  const current = await metrics(weekStart, today);
  const pastStart = addDays(weekStart, -28);
  const past = await metrics(pastStart, addDays(pastStart, elapsed - 1));
  const hasPast = past.hardSets + past.volumeKg + past.cardioMin + past.questDays > 0;
  const planned = { hardSets: Math.round(((profile.daysPerWeek ?? 3) * 15 * elapsed) / 7), volumeKg: 0, cardioMin: 0, questDays: elapsed };
  const r = shadowBoss({ current, past: hasPast ? past : null, planned, heroClass: (profile.heroClass ?? 'HYBRID') as HeroClass, experience: (profile.experience ?? 'beginner') as 'beginner' });
  const claimed = !!(await prisma.questInstance.findFirst({ where: { userId, templateId: 'boss', localDate: weekStart } }));
  return { weekStart, ...r, claimed, current, past: hasPast ? past : null };
}

/** Claims the weekly boss once it's defeated (+150 XP, once per week). */
export async function claimBoss(prisma: PrismaClient, userId: string): Promise<QuestProgressResponse> {
  const boss = await getBoss(prisma, userId);
  if (!boss.won) throw new QuestError(409, 'boss not defeated yet');
  if (boss.claimed) throw new QuestError(409, 'already claimed this week');
  try {
    return await claimBossTx(prisma, userId, boss.weekStart);
  } catch (e) {
    // a concurrent claim won the race on the (user, week, 'boss') unique key
    if (isUniqueViolation(e)) throw new QuestError(409, 'already claimed this week');
    throw e;
  }
}

async function claimBossTx(prisma: PrismaClient, userId: string, weekStart: string): Promise<QuestProgressResponse> {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({ where: { id: userId } });
    const today = gameDate(new Date(), profile?.timezone ?? 'UTC');
    const q = await tx.questInstance.create({
      data: {
        id: crypto.randomUUID(), userId, templateId: 'boss', kind: 'BOSS', localDate: weekStart, targets: {}, progress: { done: 1 },
        status: 'COMPLETED', completedAt: new Date(), dueAt: new Date(),
      },
    });
    await tx.event.create({ data: { id: q.id, userId, type: 'quest.boss.claimed', localDate: today, clientTs: new Date(), payload: { weekStart } } });
    const rewards = await grantXp(tx, { userId, eventId: q.id, localDate: today, amount: XP.bossWin, reason: 'boss' });
    return { quest: toDto(q), rewards: [{ type: 'title', titleId: 'Shadow Slayer' }, ...rewards] };
  });
}
