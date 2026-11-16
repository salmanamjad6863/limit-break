import type { MeResponse, OnboardingInput, TrainingProfile } from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import { assessmentNorms } from '@lb/content';
import { displayStat, gameDate, initialStats, levelFromXp } from '@lb/engine';

export async function getMe(prisma: PrismaClient, userId: string): Promise<MeResponse> {
  const p = await prisma.profile.findUnique({ where: { id: userId }, include: { state: true } });
  const s = p?.state;
  const weight = p?.onboardedAt
    ? await prisma.bodyMetric.findFirst({ where: { userId, weightKg: { not: null } }, orderBy: { measuredAt: 'desc' }, select: { weightKg: true } })
    : null;
  const profile: TrainingProfile | null =
    p?.onboardedAt && p.goal && p.experience && p.location && p.heightCm != null
      ? {
          goal: p.goal as TrainingProfile['goal'],
          experience: p.experience as TrainingProfile['experience'],
          location: p.location,
          equipment: p.equipment,
          injuries: p.injuries,
          daysPerWeek: p.daysPerWeek ?? 3,
          sessionMinutes: p.sessionMinutes ?? 45,
          sex: (p.sex ?? 'unspecified') as TrainingProfile['sex'],
          heightCm: p.heightCm,
          weightKg: weight?.weightKg ?? 75,
          timezone: p.timezone,
        }
      : null;
  return {
    id: userId,
    onboarded: p?.onboardedAt != null,
    hunterName: p?.hunterName ?? null,
    heroId: p?.heroId ?? null,
    heroClass: p?.heroClass ?? null,
    state: s
      ? {
          level: s.level, xp: s.xp, rank: s.rank === 'SOVEREIGN' ? 'S' : s.rank, apUnspent: s.apUnspent,
          streak: s.streak, shields: s.shields,
          stats: { STR: displayStat(s.str), AGI: displayStat(s.agi), END: displayStat(s.end), VIT: displayStat(s.vit), SPI: displayStat(s.spi) },
        }
      : null,
    profile,
  };
}

/**
 * Upserts the profile (the auth trigger may already have created it) and creates HunterState
 * with starting stats + the one-time Awakening Assessment XP (server-authoritative).
 * Re-submitting onboarding never resets an existing HunterState.
 */
export async function completeOnboarding(prisma: PrismaClient, userId: string, input: OnboardingInput) {
  const start = initialStats({
    sex: input.sex,
    experience: input.experience,
    assessment: input.assessment,
    norms: assessmentNorms,
  });
  const data = {
    hunterName: input.hunterName, heroId: input.heroId, heroClass: input.heroClass, sex: input.sex,
    birthDate: new Date(`${input.birthDate}T00:00:00Z`), heightCm: input.heightCm, goal: input.goal,
    experience: input.experience, location: input.location, equipment: input.equipment,
    injuries: input.injuries, lifestyle: input.lifestyle, nutritionMode: input.nutritionMode,
    fatPreference: input.fatPreference, daysPerWeek: input.daysPerWeek,
    sessionMinutes: input.sessionMinutes, questTime: input.questTime, timezone: input.timezone,
    baselines: input.assessment ?? undefined,
    notificationsOptIn: input.notificationsOptIn,
    onboardedAt: new Date(),
  };
  await prisma.$transaction([
    prisma.profile.upsert({ where: { id: userId }, create: { id: userId, ...data }, update: data }),
    prisma.hunterState.upsert({
      where: { userId },
      create: {
        userId,
        xp: start.xp,
        level: levelFromXp(start.xp),
        str: start.stats.STR,
        agi: start.stats.AGI,
        end: start.stats.END,
        vit: start.stats.VIT,
        spi: start.stats.SPI,
      },
      update: {},
    }),
    prisma.bodyMetric.create({
      data: {
        id: crypto.randomUUID(), userId, weightKg: input.weightKg, bodyFatPct: input.bodyFatPct,
        measuredAt: new Date(), localDate: gameDate(new Date(), input.timezone), source: 'onboarding',
      },
    }),
  ]);
  return getMe(prisma, userId);
}
