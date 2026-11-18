/**
 * Friends, guilds, raids, leagues, DMs, Hunter License — SYSTEMS.md §5.6.
 */
import { z } from 'zod';
import { HeroClass, Rank } from './common';
import { HunterCardDto } from './community';

export const GuildRole = z.enum(['leader', 'officer', 'member']);
export type GuildRole = z.infer<typeof GuildRole>;

export const LeagueTier = z.enum(['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Mythic']);
export type LeagueTier = z.infer<typeof LeagueTier>;

export const DuelStatus = z.enum(['pending', 'active', 'completed', 'declined', 'cancelled']);
export type DuelStatus = z.infer<typeof DuelStatus>;

/* ---------------- Friends ---------------- */

export const FriendStreakDto = z.object({
  friend: HunterCardDto,
  current: z.number().int().nonnegative(),
  longest: z.number().int().nonnegative(),
  /** ISO date both last completed the Daily Quest */
  lastBothDate: z.string().nullable(),
  /** you already gifted this friend a Streak Shield this calendar month */
  giftedThisMonth: z.boolean(),
  /** they gifted you this month */
  receivedThisMonth: z.boolean(),
});
export type FriendStreakDto = z.infer<typeof FriendStreakDto>;

export const FriendsResponse = z.object({
  friends: z.array(FriendStreakDto),
  /** mutual follows with no streak row yet still appear here as current: 0 */
});
export type FriendsResponse = z.infer<typeof FriendsResponse>;

export const FollowRequestDto = z.object({
  from: HunterCardDto,
  createdAt: z.string(),
});
export type FollowRequestDto = z.infer<typeof FollowRequestDto>;

/* ---------------- Duels ---------------- */

export const DuelDto = z.object({
  id: z.string(),
  status: DuelStatus,
  challenger: HunterCardDto,
  opponent: HunterCardDto,
  startsAt: z.string(),
  endsAt: z.string(),
  challengerXp: z.number().int(),
  opponentXp: z.number().int(),
  challengerBaseline: z.number().int(),
  opponentBaseline: z.number().int(),
  challengerScore: z.number(),
  opponentScore: z.number(),
  winner: z.enum(['challenger', 'opponent', 'draw']).nullable(),
  mine: z.enum(['challenger', 'opponent']),
});
export type DuelDto = z.infer<typeof DuelDto>;

export const CreateDuelInput = z.object({
  id: z.uuid(),
  opponentId: z.uuid(),
});
export type CreateDuelInput = z.input<typeof CreateDuelInput>;

/* ---------------- Guilds ---------------- */

export const GuildDto = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  isPublic: z.boolean(),
  language: z.string().nullable(),
  timezone: z.string(),
  memberCount: z.number().int(),
  myRole: GuildRole.nullable(),
});
export type GuildDto = z.infer<typeof GuildDto>;

export const GuildMemberDto = z.object({
  user: HunterCardDto,
  role: GuildRole,
  joinedAt: z.string(),
});
export type GuildMemberDto = z.infer<typeof GuildMemberDto>;

export const CreateGuildInput = z.object({
  id: z.uuid(),
  name: z.string().trim().min(3).max(32),
  isPublic: z.boolean().default(true),
  language: z.string().trim().min(2).max(8).nullable().default(null),
  timezone: z.string().min(1).max(64).default('UTC'),
});
export type CreateGuildInput = z.input<typeof CreateGuildInput>;

export const JoinGuildInput = z.object({
  code: z.string().trim().toUpperCase().min(4).max(12),
});
export type JoinGuildInput = z.input<typeof JoinGuildInput>;

export const GuildMessageDto = z.object({
  id: z.string(),
  author: HunterCardDto,
  body: z.string(),
  status: z.enum(['pending', 'visible', 'hidden']),
  mine: z.boolean(),
  createdAt: z.string(),
});
export type GuildMessageDto = z.infer<typeof GuildMessageDto>;

export const CreateGuildMessageInput = z.object({
  id: z.uuid(),
  body: z.string().trim().min(1).max(500),
});
export type CreateGuildMessageInput = z.input<typeof CreateGuildMessageInput>;

/* ---------------- Raids ---------------- */

export const RaidContributionDto = z.object({
  user: HunterCardDto,
  xp: z.number().int(),
  expectedXp: z.number().int(),
  contribution: z.number(),
  earnsLoot: z.boolean(),
});
export type RaidContributionDto = z.infer<typeof RaidContributionDto>;

export const RaidDto = z.object({
  id: z.string(),
  weekStart: z.string(),
  bossHp: z.number().int(),
  damageTotal: z.number().int(),
  hpLeftRatio: z.number(),
  cleared: z.boolean(),
  endsAt: z.string(),
  contributions: z.array(RaidContributionDto),
});
export type RaidDto = z.infer<typeof RaidDto>;

/* ---------------- Leagues ---------------- */

export const LeagueMemberDto = z.object({
  user: HunterCardDto,
  xp: z.number().int(),
  place: z.number().int().nullable(),
  mine: z.boolean(),
});
export type LeagueMemberDto = z.infer<typeof LeagueMemberDto>;

export const LeagueDto = z.object({
  id: z.string(),
  weekStart: z.string(),
  tier: LeagueTier,
  members: z.array(LeagueMemberDto),
  myPlace: z.number().int().nullable(),
  promoteThrough: z.number().int(),
  demoteFrom: z.number().int(),
});
export type LeagueDto = z.infer<typeof LeagueDto>;

/* ---------------- DMs ---------------- */

export const ConversationDto = z.object({
  id: z.string(),
  peer: HunterCardDto,
  status: z.enum(['open', 'request']),
  lastBody: z.string().nullable(),
  lastAt: z.string().nullable(),
  unread: z.number().int(),
});
export type ConversationDto = z.infer<typeof ConversationDto>;

export const MessageDto = z.object({
  id: z.string(),
  senderId: z.string(),
  body: z.string(),
  status: z.enum(['pending', 'visible', 'hidden']),
  mine: z.boolean(),
  createdAt: z.string(),
});
export type MessageDto = z.infer<typeof MessageDto>;

export const SendMessageInput = z.object({
  id: z.uuid(),
  /** start or continue a DM with this hunter (must be mutual follow, both 18+) */
  peerId: z.uuid(),
  body: z.string().trim().min(1).max(1000),
});
export type SendMessageInput = z.input<typeof SendMessageInput>;

/* ---------------- Hunter License ---------------- */

export const HunterLicenseDto = z.object({
  handle: z.string(),
  hunterName: z.string().nullable(),
  heroId: z.string().nullable(),
  heroClass: HeroClass.nullable(),
  rank: Rank,
  level: z.number().int(),
  powerLevel: z.number().int(),
  title: z.string().nullable(),
  stats: z.object({ STR: z.number(), AGI: z.number(), END: z.number(), VIT: z.number(), SPI: z.number() }),
  streak: z.number().int(),
});
export type HunterLicenseDto = z.infer<typeof HunterLicenseDto>;
