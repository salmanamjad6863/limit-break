/**
 * Own habit challenges: solo, always flexible (grace days, never restart).
 * Check-ins are absolute ("these tasks are done on this date"), so an offline replay is safe.
 * A fully done day pays XP once; unticking later never takes it back, so toggling can't farm.
 */
import { randomUUID } from 'node:crypto';
import { exerciseById } from '@lb/content';
import type { ChallengeCheckinInput, ChallengeDto, CreateChallengeInput } from '@lb/contracts';
import type { Prisma, PrismaClient } from '@lb/db';
import { addDays, CHALLENGE_LIMITS, CHALLENGE_XP, challengeProblems, challengeProgress, gameDate, type Challenge } from '@lb/engine';
import { grantXp } from '../progression/xp';

export class ChallengeError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

type Row = Prisma.ChallengeGetPayload<{ include: { checkins: true } }>;
const asEngine = (r: Row): Challenge => ({
  id: r.id, name: r.name, days: r.days, graceDays: r.graceDays, startDate: r.startDate,
  tasks: r.tasks as unknown as Challenge['tasks'], status: r.status as Challenge['status'],
});
const checkinsOf = (r: Row) => Object.fromEntries(r.checkins.map((c) => [c.localDate, c.done]));
const toDto = (r: Row): ChallengeDto => ({
  ...asEngine(r), tasks: r.tasks as unknown as ChallengeDto['tasks'], checkins: checkinsOf(r), completedAt: r.completedAt?.toISOString() ?? null,
});

async function timezone(prisma: Pick<PrismaClient, 'profile'>, userId: string) {
  const p = await prisma.profile.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!p) throw new ChallengeError(404, 'profile not found');
  return p.timezone ?? 'UTC';
}

/** Active challenges plus the 20 most recent finished or ended ones. */
export async function listChallenges(prisma: PrismaClient, userId: string): Promise<ChallengeDto[]> {
  const rows = await prisma.challenge.findMany({
    where: { userId }, include: { checkins: true }, orderBy: { createdAt: 'desc' }, take: CHALLENGE_LIMITS.maxActive + 20,
  });
  return rows.map(toDto);
}

export async function createChallenge(prisma: PrismaClient, userId: string, input: CreateChallengeInput, now = new Date()): Promise<ChallengeDto> {
  const existing = await prisma.challenge.findUnique({ where: { id: input.id }, include: { checkins: true } });
  if (existing) {
    // an offline create replayed: same answer; someone else's id: not yours
    if (existing.userId !== userId) throw new ChallengeError(409, 'id taken');
    return toDto(existing);
  }
  const problems = challengeProblems(input, (id) => exerciseById.has(id));
  if (problems.length) throw new ChallengeError(400, problems[0]!);
  const today = gameDate(now, await timezone(prisma, userId));
  // start yesterday at the earliest (created just after the rollover) and at most a week ahead
  if (input.startDate < addDays(today, -1) || input.startDate > addDays(today, 7)) throw new ChallengeError(400, 'start date must be within the next week');
  const active = await prisma.challenge.count({ where: { userId, status: 'ACTIVE' } });
  if (active >= CHALLENGE_LIMITS.maxActive) throw new ChallengeError(409, `at most ${CHALLENGE_LIMITS.maxActive} active challenges`);
  const row = await prisma.challenge.create({
    data: {
      id: input.id, userId, name: input.name, days: input.days, graceDays: input.graceDays, startDate: input.startDate,
      tasks: input.tasks as unknown as Prisma.InputJsonValue,
    },
    include: { checkins: true },
  });
  return toDto(row);
}

export async function checkin(prisma: PrismaClient, userId: string, id: string, input: ChallengeCheckinInput, now = new Date()) {
  const today = gameDate(now, await timezone(prisma, userId));
  return prisma.$transaction(async (tx) => {
    const c = await tx.challenge.findFirst({ where: { id, userId }, include: { checkins: true } });
    if (!c) throw new ChallengeError(404, 'challenge not found');
    if (c.status !== 'ACTIVE') return { challenge: toDto(c), rewards: [] as unknown[] };
    // today, or fix yesterday; never the future, never before day 1
    if (input.date > today || input.date < addDays(today, -1) || input.date < c.startDate) throw new ChallengeError(409, 'only today or yesterday can be checked in');
    const engine = asEngine(c);
    const done = [...new Set(input.done)].filter((t) => engine.tasks.some((x) => x.id === t));
    await tx.challengeCheckin.upsert({
      where: { challengeId_localDate: { challengeId: c.id, localDate: input.date } },
      create: { challengeId: c.id, localDate: input.date, done },
      update: { done },
    });

    const rewards: unknown[] = [];
    const full = engine.tasks.every((t) => done.includes(t.id));
    // pay a full day once: the conditional update wins for exactly one request
    if (full && (await tx.challengeCheckin.updateMany({ where: { challengeId: c.id, localDate: input.date, rewarded: false }, data: { rewarded: true } })).count === 1) {
      const eventId = randomUUID();
      await tx.event.create({ data: { id: eventId, userId, type: 'challenge.day.completed', localDate: input.date, clientTs: now, payload: { challengeId: c.id } } });
      rewards.push(...(await grantXp(tx, { userId, eventId, localDate: input.date, amount: CHALLENGE_XP.day, reason: 'challenge:day' })));
    }

    const fresh = await tx.challenge.findFirstOrThrow({ where: { id: c.id }, include: { checkins: true } });
    const p = challengeProgress(asEngine(fresh), checkinsOf(fresh), today);
    if (p.finished && (await tx.challenge.updateMany({ where: { id: c.id, status: 'ACTIVE' }, data: { status: 'COMPLETED', completedAt: now } })).count === 1) {
      const eventId = randomUUID();
      await tx.event.create({ data: { id: eventId, userId, type: 'challenge.completed', localDate: today, clientTs: now, payload: { challengeId: c.id, flawless: p.flawless } } });
      const amount = CHALLENGE_XP.finish(c.days) + (p.flawless ? CHALLENGE_XP.flawlessBonus : 0);
      rewards.push({ type: 'challengeComplete', name: c.name, days: c.days, flawless: p.flawless });
      rewards.push(...(await grantXp(tx, { userId, eventId, localDate: today, amount, reason: 'challenge:complete' })));
    }
    const out = await tx.challenge.findFirstOrThrow({ where: { id: c.id }, include: { checkins: true } });
    return { challenge: toDto(out), rewards };
  });
}

/** Stop a challenge early (kept in the list as ended; XP already earned stays). */
export async function endChallenge(prisma: PrismaClient, userId: string, id: string, now = new Date()): Promise<ChallengeDto> {
  await prisma.challenge.updateMany({ where: { id, userId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: now } });
  const row = await prisma.challenge.findFirst({ where: { id, userId }, include: { checkins: true } });
  if (!row) throw new ChallengeError(404, 'challenge not found');
  return toDto(row);
}
