/**
 * Community (SYSTEMS.md §5): handles, follows, feed, reactions, comments, blocks, reports, moderation.
 * Every read is filtered for the viewer: blocked users are mutually invisible, private and
 * followers-only posts stay with their audience, and unmoderated content is shown only to its author.
 */
import { createHash, randomUUID } from 'node:crypto';
import type {
  CommentDto, CommunityMeResponse, CreateCommentInput, CreatePostInput, FeedResponse, FeedTab, HunterCardDto,
  MilestonePayload, ModerationItem, PostDto, PublicProfileResponse, ReportInput, Sticker, UpdateCommunityProfileInput, WorkoutCard,
} from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import { displayStat, powerLevel } from '@lb/engine';
import { getWorkout } from '../workouts/service';
import { moderate, localCheck, type Classifier, type ModerationVerdict } from './moderation';
import { isMinor, limits, permissions, type TrustInput } from './trust';

export class CommunityError extends Error {
  constructor(public status: 400 | 403 | 404 | 409 | 429, message: string) {
    super(message);
  }
}

export interface CommunityCtx {
  prisma: PrismaClient;
  userId: string;
  isGuest: boolean;
  moderatorIds?: string[];
  classifier?: Classifier;
  extraWords?: string[];
}

type Rank = HunterCardDto['rank'];
const RANK = (r: string | null | undefined): Rank => (r === 'SOVEREIGN' ? 'S' : ((r ?? 'E') as Rank));
/** "My rank" tab and board divisions group neighbouring ranks so beginners see beginners */
export const TIERS: Record<'ED' | 'CB' | 'AS', string[]> = { ED: ['E', 'D'], CB: ['C', 'B'], AS: ['A', 'S', 'SOVEREIGN'] };
const tierOf = (r: Rank): string[] => (r === 'E' || r === 'D' ? TIERS.ED : r === 'C' || r === 'B' ? TIERS.CB : TIERS.AS);
const RESERVED = new Set(['admin', 'administrator', 'moderator', 'mod', 'support', 'limitbreak', 'system', 'official', 'staff', 'help', 'root', 'null', 'undefined', 'me']);
const DAY = 86_400_000;

/* ---------------- viewer ---------------- */

async function viewer(ctx: CommunityCtx) {
  const { prisma, userId } = ctx;
  const [profile, pub, workouts, upheld] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId }, select: { createdAt: true, birthDate: true, state: { select: { level: true, rank: true } } } }),
    prisma.publicProfile.findUnique({ where: { userId } }),
    prisma.workoutSession.count({ where: { userId } }),
    prisma.report.count({ where: { status: 'upheld', resolvedAt: { gte: new Date(Date.now() - 30 * DAY) }, OR: [{ targetType: 'profile', targetId: userId }, { targetType: { in: ['post', 'comment'] }, targetId: { in: await ownedTargetIds(prisma, userId) } }] } }),
  ]);
  if (!profile) throw new CommunityError(404, 'profile not found');
  const input: TrustInput = {
    isGuest: ctx.isGuest,
    isModerator: !!ctx.moderatorIds?.includes(userId),
    createdAt: profile.createdAt,
    birthDate: profile.birthDate,
    level: profile.state?.level ?? 1,
    workouts,
    upheldReports: upheld,
    handle: pub?.handle ?? null,
    isPublic: pub?.isPublic ?? false,
  };
  return { ...permissions(input), pub, rank: RANK(profile.state?.rank), input };
}

/** ids of this user's recent posts and comments (for upheld-report lookups) */
async function ownedTargetIds(prisma: PrismaClient, userId: string) {
  const since = new Date(Date.now() - 30 * DAY);
  const [p, c] = await Promise.all([
    prisma.post.findMany({ where: { authorId: userId, createdAt: { gte: since } }, select: { id: true } }),
    prisma.comment.findMany({ where: { authorId: userId, createdAt: { gte: since } }, select: { id: true } }),
  ]);
  return [...p.map((x) => x.id), ...c.map((x) => x.id)];
}

async function relations(prisma: PrismaClient, userId: string) {
  const [blocks, follows] = await Promise.all([
    prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } }),
    prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } }),
  ]);
  const hidden = new Set(blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));
  return { hidden: [...hidden], following: follows.map((f) => f.followeeId) };
}

/** The visibility rule every post query uses. */
function visibleTo(userId: string, rel: { hidden: string[]; following: string[] }) {
  return {
    authorId: { notIn: rel.hidden },
    OR: [
      { authorId: userId, status: { in: ['pending', 'visible', 'hidden'] } },
      { status: 'visible', visibility: 'public', author: { publicProfile: { isPublic: true } } },
      { status: 'visible', visibility: { in: ['public', 'followers'] }, authorId: { in: rel.following } },
    ],
  };
}

/* ---------------- hunter cards ---------------- */

export async function hunterCards(prisma: PrismaClient, ids: string[]): Promise<Map<string, HunterCardDto>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await prisma.publicProfile.findMany({
    where: { userId: { in: unique } },
    select: {
      userId: true, handle: true,
      profile: { select: { heroId: true, heroClass: true, state: { select: { level: true, rank: true, str: true, agi: true, end: true, vit: true, spi: true } } } },
    },
  });
  const out = new Map<string, HunterCardDto>();
  for (const r of rows) {
    const s = r.profile.state;
    const level = s?.level ?? 1;
    const stats = { STR: displayStat(s?.str ?? 10), AGI: displayStat(s?.agi ?? 10), END: displayStat(s?.end ?? 10), VIT: displayStat(s?.vit ?? 10), SPI: displayStat(s?.spi ?? 10) };
    out.set(r.userId, {
      userId: r.userId, handle: r.handle, heroId: r.profile.heroId, heroClass: (r.profile.heroClass as HunterCardDto['heroClass']) ?? null,
      rank: RANK(s?.rank), level,
      // same Power Level as the Home screen (display stats, scaled by level)
      powerLevel: powerLevel(stats, level),
    });
  }
  return out;
}

type PostRow = Awaited<ReturnType<PrismaClient['post']['findMany']>>[number];

async function toDtos(prisma: PrismaClient, userId: string, rows: PostRow[]): Promise<PostDto[]> {
  const [cards, mine] = await Promise.all([
    hunterCards(prisma, rows.map((r) => r.authorId)),
    rows.length ? prisma.reaction.findMany({ where: { userId, postId: { in: rows.map((r) => r.id) } } }) : Promise.resolve([]),
  ]);
  const myReaction = new Map(mine.map((m) => [m.postId, m.sticker as Sticker]));
  return rows.flatMap((r) => {
    const author = cards.get(r.authorId);
    if (!author) return [];
    const payload = (r.payload ?? {}) as { milestone?: MilestonePayload; workout?: WorkoutCard };
    return [{
      id: r.id, type: r.type as PostDto['type'], author, body: r.body,
      milestone: payload.milestone ?? null, workout: payload.workout ?? null,
      visibility: r.visibility as PostDto['visibility'], status: r.status as PostDto['status'],
      commentsMode: r.commentsMode as PostDto['commentsMode'],
      respectCount: r.respectCount, commentCount: r.commentCount,
      myReaction: myReaction.get(r.id) ?? null, mine: r.authorId === userId, createdAt: r.createdAt.toISOString(),
    }];
  });
}

/* ---------------- me / handle ---------------- */

export async function getCommunityMe(ctx: CommunityCtx): Promise<CommunityMeResponse> {
  const v = await viewer(ctx);
  const [followers, following] = await Promise.all([
    ctx.prisma.follow.count({ where: { followeeId: ctx.userId } }),
    ctx.prisma.follow.count({ where: { followerId: ctx.userId } }),
  ]);
  return {
    handle: v.pub?.handle ?? null, isPublic: v.pub?.isPublic ?? true, bio: v.pub?.bio ?? null,
    trustLevel: v.trustLevel, isGuest: v.isGuest, isMinor: v.isMinor, can: v.can, nextUnlock: v.nextUnlock, followers, following,
  };
}

export async function updateCommunityProfile(ctx: CommunityCtx, input: UpdateCommunityProfileInput) {
  if (ctx.isGuest) throw new CommunityError(403, 'save your account to join the community');
  const { prisma, userId } = ctx;
  const existing = await prisma.publicProfile.findUnique({ where: { userId } });
  if (!existing && !input.handle) throw new CommunityError(400, 'pick a handle first');
  if (input.handle && input.handle !== existing?.handle) {
    if (RESERVED.has(input.handle) || localCheck(input.handle.replace(/[._]/g, ' '))) throw new CommunityError(400, 'that handle is not available');
    const taken = await prisma.publicProfile.findUnique({ where: { handle: input.handle } });
    if (taken) throw new CommunityError(409, 'that handle is taken');
  }
  if (input.bio) {
    const v = localCheck(input.bio);
    if (v) throw new CommunityError(400, 'your bio contains something we can’t show (links, contact details or harmful words)');
  }
  // minors' profiles are always private (SYSTEMS.md §5.5.3)
  const profile = await prisma.profile.findUnique({ where: { id: userId }, select: { birthDate: true } });
  const forcePrivate = isMinor(profile?.birthDate ?? null);
  const data = {
    ...(input.handle ? { handle: input.handle } : {}),
    ...(input.isPublic !== undefined ? { isPublic: forcePrivate ? false : input.isPublic } : {}),
    ...(input.bio !== undefined ? { bio: input.bio || null } : {}),
  };
  try {
    if (existing) await prisma.publicProfile.update({ where: { userId }, data });
    else await prisma.publicProfile.create({ data: { userId, handle: input.handle!, isPublic: !forcePrivate && (input.isPublic ?? true), bio: input.bio ?? null } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new CommunityError(409, 'that handle is taken');
    throw e;
  }
  return getCommunityMe(ctx);
}

/* ---------------- feed ---------------- */

const PAGE = 20;

export async function feed(ctx: CommunityCtx, tab: FeedTab, cursor?: string): Promise<FeedResponse> {
  const { prisma, userId } = ctx;
  const [rel, me] = await Promise.all([relations(prisma, userId), prisma.hunterState.findUnique({ where: { userId }, select: { rank: true } })]);
  const base = visibleTo(userId, rel);

  if (tab === 'global') {
    // hot = (respect + 2 × comments) / (ageHours + 2)^1.5 over the last 7 days, max 2 posts per author per page
    const rows = await prisma.post.findMany({
      where: { AND: [base, { visibility: 'public', status: 'visible', createdAt: { gte: new Date(Date.now() - 7 * DAY) } }] },
      orderBy: { createdAt: 'desc' }, take: 300,
    });
    const now = Date.now();
    const hot = (p: PostRow) => (p.respectCount + 2 * p.commentCount + 1) / Math.pow((now - p.createdAt.getTime()) / 3_600_000 + 2, 1.5);
    const ranked = [...rows].sort((a, b) => hot(b) - hot(a));
    const offset = Number(cursor ?? 0) || 0;
    const pageRows: PostRow[] = [];
    const perAuthor = new Map<string, number>();
    const rest: PostRow[] = [];
    for (const p of ranked.slice(offset)) {
      if (pageRows.length >= PAGE) break;
      const n = perAuthor.get(p.authorId) ?? 0;
      if (n >= 2) { rest.push(p); continue; }
      perAuthor.set(p.authorId, n + 1);
      pageRows.push(p);
    }
    const consumed = offset + pageRows.length + rest.length;
    return { posts: await toDtos(prisma, userId, pageRows), nextCursor: consumed < ranked.length ? String(consumed) : null };
  }

  const before = cursor ? new Date(cursor) : undefined;
  const scope =
    tab === 'following'
      ? { authorId: { in: [userId, ...rel.following] } }
      : { visibility: 'public', status: 'visible', authorRank: { in: tierOf(RANK(me?.rank)) } };
  const rows = await prisma.post.findMany({
    where: { AND: [base, scope, ...(before && !Number.isNaN(before.getTime()) ? [{ createdAt: { lt: before } }] : [])] },
    orderBy: { createdAt: 'desc' }, take: PAGE,
  });
  return { posts: await toDtos(prisma, userId, rows), nextCursor: rows.length === PAGE ? rows.at(-1)!.createdAt.toISOString() : null };
}

/* ---------------- posts ---------------- */

async function audit(prisma: PrismaClient, targetType: string, targetId: string, v: ModerationVerdict) {
  await prisma.moderationAction.create({
    data: {
      id: randomUUID(), targetType, targetId, action: v.allow ? 'auto_allow' : 'auto_hold',
      reason: `${v.source}:${v.severity}${v.categories.length ? `:${v.categories.join(',')}` : ''}`,
    },
  });
}

export async function createPost(ctx: CommunityCtx, input: CreatePostInput & { body: string }): Promise<PostDto> {
  const { prisma, userId } = ctx;
  const existing = await prisma.post.findUnique({ where: { id: input.id } });
  if (existing) {
    if (existing.authorId !== userId) throw new CommunityError(409, 'post id already used');
    return (await toDtos(prisma, userId, [existing]))[0]!;
  }
  const v = await viewer(ctx);
  if (!v.can.post) throw new CommunityError(403, v.nextUnlock ?? 'posting is not available on your account');
  const visibility = input.visibility ?? 'followers';
  if (visibility === 'public' && !v.can.postPublic) throw new CommunityError(403, 'public posts unlock at Trusted (level 10, 14 days)');
  const recent = await prisma.post.count({ where: { authorId: userId, type: 'progress', createdAt: { gte: new Date(Date.now() - DAY) } } });
  if (recent >= limits(v.trustLevel).postsPerDay) throw new CommunityError(429, 'daily post limit reached; try again tomorrow');

  let workout: WorkoutCard | null = null;
  if (input.workoutId) {
    const w = await getWorkout(prisma, userId, input.workoutId).catch(() => null);
    if (!w) throw new CommunityError(400, 'workout not found');
    workout = { workoutId: w.id, name: w.name, minutes: w.minutes, workingSets: w.workingSets, volumeKg: w.volumeKg, prs: w.prs };
  }
  const verdict = await moderate(input.body, { classifier: ctx.classifier, trustLevel: v.trustLevel, extraWords: ctx.extraWords });
  const row = await prisma.post.create({
    data: {
      id: input.id, authorId: userId, type: 'progress', body: input.body, payload: workout ? { workout } : undefined,
      visibility, status: verdict.allow ? 'visible' : 'pending', commentsMode: input.commentsMode ?? 'all', authorRank: v.rank,
    },
  });
  await audit(prisma, 'post', row.id, verdict);
  return (await toDtos(prisma, userId, [row]))[0]!;
}

export async function deletePost(ctx: CommunityCtx, postId: string) {
  const post = await ctx.prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.authorId !== ctx.userId) throw new CommunityError(404, 'post not found');
  await ctx.prisma.post.update({ where: { id: postId }, data: { status: 'removed' } });
  return { ok: true };
}

/**
 * Auto milestone posts (rank-up, PR, level every 5, streak milestones). Only for hunters who joined the
 * community (picked a handle); followers-only by default. Never throws: a feed post must not fail a workout.
 */
export async function createMilestone(prisma: PrismaClient, userId: string, milestone: MilestonePayload, dedupeKey: string) {
  try {
    const pub = await prisma.publicProfile.findUnique({ where: { userId }, select: { userId: true } });
    if (!pub) return;
    const state = await prisma.hunterState.findUnique({ where: { userId }, select: { rank: true } });
    // deterministic id per event: a retried workout never posts twice
    const id = uuidFrom(`${userId}:${dedupeKey}`);
    await prisma.post.upsert({
      where: { id },
      create: { id, authorId: userId, type: 'milestone', payload: { milestone }, visibility: 'followers', status: 'visible', authorRank: RANK(state?.rank) },
      update: {},
    });
  } catch (e) {
    console.error('milestone post failed', e);
  }
}

/** RFC 4122 v5-style UUID from a string (deterministic, no extra dependency). */
function uuidFrom(key: string) {
  const h = createHash('sha1').update(`limitbreak:${key}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

async function postVisibleTo(ctx: CommunityCtx, postId: string) {
  const rel = await relations(ctx.prisma, ctx.userId);
  const post = await ctx.prisma.post.findFirst({ where: { AND: [{ id: postId }, visibleTo(ctx.userId, rel)] } });
  if (!post) throw new CommunityError(404, 'post not found');
  return { post, rel };
}

/* ---------------- reactions ---------------- */

export async function react(ctx: CommunityCtx, postId: string, sticker: Sticker) {
  const v = await viewer(ctx);
  if (!v.can.react) throw new CommunityError(403, v.nextUnlock ?? 'reactions are not available on your account');
  const { post } = await postVisibleTo(ctx, postId);
  if (post.status !== 'visible') throw new CommunityError(400, 'this post is not public yet');
  const { prisma, userId } = ctx;
  await prisma.$transaction(async (tx) => {
    const had = await tx.reaction.findUnique({ where: { postId_userId: { postId, userId } } });
    if (had) await tx.reaction.update({ where: { postId_userId: { postId, userId } }, data: { sticker } });
    else {
      await tx.reaction.create({ data: { postId, userId, sticker } });
      await tx.post.update({ where: { id: postId }, data: { respectCount: { increment: 1 } } });
    }
  });
  return { ok: true };
}

export async function unreact(ctx: CommunityCtx, postId: string) {
  const { prisma, userId } = ctx;
  await prisma.$transaction(async (tx) => {
    const had = await tx.reaction.findUnique({ where: { postId_userId: { postId, userId } } });
    if (!had) return;
    await tx.reaction.delete({ where: { postId_userId: { postId, userId } } });
    await tx.post.update({ where: { id: postId }, data: { respectCount: { decrement: 1 } } });
  });
  return { ok: true };
}

/* ---------------- comments ---------------- */

export async function listComments(ctx: CommunityCtx, postId: string): Promise<CommentDto[]> {
  const { rel } = await postVisibleTo(ctx, postId);
  const rows = await ctx.prisma.comment.findMany({
    where: {
      postId, authorId: { notIn: rel.hidden },
      OR: [{ status: 'visible' }, { authorId: ctx.userId, status: { in: ['pending', 'hidden'] } }],
    },
    orderBy: { createdAt: 'asc' }, take: 200,
  });
  const cards = await hunterCards(ctx.prisma, rows.map((r) => r.authorId));
  return rows.flatMap((r) => {
    const author = cards.get(r.authorId);
    return author ? [{ id: r.id, postId: r.postId, parentId: r.parentId, author, body: r.body, status: r.status as CommentDto['status'], mine: r.authorId === ctx.userId, createdAt: r.createdAt.toISOString() }] : [];
  });
}

export async function createComment(ctx: CommunityCtx, postId: string, input: CreateCommentInput & { body: string }): Promise<CommentDto> {
  const { prisma, userId } = ctx;
  const dup = await prisma.comment.findUnique({ where: { id: input.id } });
  if (dup) {
    if (dup.authorId !== userId) throw new CommunityError(409, 'comment id already used');
    return (await listComments(ctx, postId)).find((c) => c.id === dup.id)!;
  }
  const v = await viewer(ctx);
  if (!v.can.comment) throw new CommunityError(403, v.nextUnlock ?? 'comments are not available on your account');
  const { post, rel } = await postVisibleTo(ctx, postId);
  if (post.status !== 'visible') throw new CommunityError(400, 'this post is not public yet');
  if (post.commentsMode === 'off' && post.authorId !== userId) throw new CommunityError(403, 'comments are turned off');
  if (post.commentsMode === 'followers' && post.authorId !== userId && !rel.following.includes(post.authorId)) {
    throw new CommunityError(403, 'only followers can comment');
  }
  if (input.parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: input.parentId } });
    if (!parent || parent.postId !== postId || parent.parentId) throw new CommunityError(400, 'you can reply to a comment, not to a reply');
  }
  const lastHour = await prisma.comment.count({ where: { authorId: userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (lastHour >= limits(v.trustLevel).commentsPerHour) throw new CommunityError(429, 'too many comments; take a breather');
  const verdict = await moderate(input.body, { classifier: ctx.classifier, trustLevel: v.trustLevel, extraWords: ctx.extraWords });
  const status = verdict.allow ? 'visible' : 'pending';
  const row = await prisma.$transaction(async (tx) => {
    const c = await tx.comment.create({ data: { id: input.id, postId, authorId: userId, parentId: input.parentId ?? null, body: input.body, status } });
    if (status === 'visible') await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
    return c;
  });
  await audit(prisma, 'comment', row.id, verdict);
  const card = (await hunterCards(prisma, [userId])).get(userId)!;
  return { id: row.id, postId, parentId: row.parentId, author: card, body: row.body, status, mine: true, createdAt: row.createdAt.toISOString() };
}

export async function deleteComment(ctx: CommunityCtx, commentId: string) {
  const { prisma, userId } = ctx;
  const c = await prisma.comment.findUnique({ where: { id: commentId }, include: { post: { select: { authorId: true } } } });
  // the author of a comment, or of the post it's on, can remove it
  if (!c || (c.authorId !== userId && c.post.authorId !== userId)) throw new CommunityError(404, 'comment not found');
  await prisma.$transaction(async (tx) => {
    await tx.comment.update({ where: { id: commentId }, data: { status: 'removed' } });
    if (c.status === 'visible') await tx.post.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } });
  });
  return { ok: true };
}

/* ---------------- follow / block / report ---------------- */

async function targetHunter(prisma: PrismaClient, userId: string) {
  const pub = await prisma.publicProfile.findUnique({ where: { userId } });
  if (!pub) throw new CommunityError(404, 'hunter not found');
  return pub;
}

export async function follow(ctx: CommunityCtx, targetId: string) {
  if (targetId === ctx.userId) throw new CommunityError(400, 'you can’t follow yourself');
  const v = await viewer(ctx);
  if (!v.can.follow) throw new CommunityError(403, v.nextUnlock ?? 'following is not available on your account');
  await targetHunter(ctx.prisma, targetId);
  const rel = await relations(ctx.prisma, ctx.userId);
  if (rel.hidden.includes(targetId)) throw new CommunityError(404, 'hunter not found');
  const total = await ctx.prisma.follow.count({ where: { followerId: ctx.userId } });
  if (total >= 2000) throw new CommunityError(429, 'you follow the maximum number of hunters');
  await ctx.prisma.follow.upsert({
    where: { followerId_followeeId: { followerId: ctx.userId, followeeId: targetId } },
    create: { followerId: ctx.userId, followeeId: targetId }, update: {},
  });
  return { ok: true };
}

export async function unfollow(ctx: CommunityCtx, targetId: string) {
  await ctx.prisma.follow.deleteMany({ where: { followerId: ctx.userId, followeeId: targetId } });
  return { ok: true };
}

export async function block(ctx: CommunityCtx, targetId: string) {
  if (ctx.isGuest) throw new CommunityError(403, 'save your account to use the community');
  if (targetId === ctx.userId) throw new CommunityError(400, 'you can’t block yourself');
  await targetHunter(ctx.prisma, targetId);
  await ctx.prisma.$transaction([
    ctx.prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: ctx.userId, blockedId: targetId } }, create: { blockerId: ctx.userId, blockedId: targetId }, update: {} }),
    ctx.prisma.follow.deleteMany({ where: { OR: [{ followerId: ctx.userId, followeeId: targetId }, { followerId: targetId, followeeId: ctx.userId }] } }),
  ]);
  return { ok: true };
}

export async function unblock(ctx: CommunityCtx, targetId: string) {
  await ctx.prisma.block.deleteMany({ where: { blockerId: ctx.userId, blockedId: targetId } });
  return { ok: true };
}

/** Three open reports hold a post or comment for review until a moderator decides. */
const AUTO_HOLD_REPORTS = 3;

export async function report(ctx: CommunityCtx, input: ReportInput) {
  if (ctx.isGuest) throw new CommunityError(403, 'save your account to report content');
  const { prisma, userId } = ctx;
  try {
    await prisma.report.create({ data: { id: randomUUID(), reporterId: userId, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details ?? null } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return { ok: true }; // already reported by this hunter
    throw e;
  }
  if (input.targetType === 'post' || input.targetType === 'comment') {
    const open = await prisma.report.count({ where: { targetType: input.targetType, targetId: input.targetId, status: 'open' } });
    if (open >= AUTO_HOLD_REPORTS) {
      if (input.targetType === 'post') await prisma.post.updateMany({ where: { id: input.targetId, status: 'visible' }, data: { status: 'pending' } });
      else {
        const c = await prisma.comment.findUnique({ where: { id: input.targetId } });
        if (c?.status === 'visible') {
          await prisma.$transaction([
            prisma.comment.update({ where: { id: c.id }, data: { status: 'pending' } }),
            prisma.post.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } }),
          ]);
        }
      }
      await prisma.moderationAction.create({ data: { id: randomUUID(), targetType: input.targetType, targetId: input.targetId, action: 'auto_hold', reason: `reports:${open}` } });
    }
  }
  return { ok: true };
}

/* ---------------- public profile ---------------- */

export async function publicProfile(ctx: CommunityCtx, handle: string): Promise<PublicProfileResponse> {
  const { prisma, userId } = ctx;
  const pub = await prisma.publicProfile.findUnique({ where: { handle: handle.toLowerCase() } });
  if (!pub) throw new CommunityError(404, 'hunter not found');
  const rel = await relations(prisma, userId);
  if (rel.hidden.includes(pub.userId)) throw new CommunityError(404, 'hunter not found');
  const iFollow = rel.following.includes(pub.userId);
  // a private profile shows only the card to non-followers
  const showPosts = pub.isPublic || iFollow || pub.userId === userId;
  const [card, followers, following, followsMe, rows] = await Promise.all([
    hunterCards(prisma, [pub.userId]),
    prisma.follow.count({ where: { followeeId: pub.userId } }),
    prisma.follow.count({ where: { followerId: pub.userId } }),
    prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: pub.userId, followeeId: userId } } }),
    showPosts
      ? prisma.post.findMany({ where: { AND: [visibleTo(userId, rel), { authorId: pub.userId }] }, orderBy: { createdAt: 'desc' }, take: 20 })
      : Promise.resolve([]),
  ]);
  return {
    hunter: card.get(pub.userId)!, bio: pub.bio, followers, following, iFollow, followsMe: !!followsMe,
    posts: await toDtos(prisma, userId, rows),
  };
}

/* ---------------- moderation queue (moderators) ---------------- */

function requireModerator(ctx: CommunityCtx) {
  if (!ctx.moderatorIds?.includes(ctx.userId)) throw new CommunityError(403, 'moderators only');
}

export async function moderationQueue(ctx: CommunityCtx): Promise<ModerationItem[]> {
  requireModerator(ctx);
  const { prisma } = ctx;
  const [posts, comments, reports] = await Promise.all([
    prisma.post.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 100 }),
    prisma.comment.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 100 }),
    prisma.report.groupBy({ by: ['targetType', 'targetId'], where: { status: 'open', targetType: { in: ['post', 'comment'] } }, _count: { _all: true } }),
  ]);
  const reportCount = new Map(reports.map((r) => [`${r.targetType}:${r.targetId}`, r._count._all]));
  const ids = [...posts.map((p) => p.id), ...comments.map((c) => c.id)];
  const actions = ids.length ? await prisma.moderationAction.findMany({ where: { targetId: { in: ids } }, orderBy: { createdAt: 'asc' } }) : [];
  const reasons = new Map<string, string[]>();
  for (const a of actions) reasons.set(a.targetId, [...(reasons.get(a.targetId) ?? []), a.reason]);
  const cards = await hunterCards(prisma, [...posts.map((p) => p.authorId), ...comments.map((c) => c.authorId)]);
  const item = (targetType: 'post' | 'comment', r: { id: string; body: string | null; authorId: string; status: string; createdAt: Date }): ModerationItem => ({
    targetType, targetId: r.id, body: r.body, author: cards.get(r.authorId)?.handle ?? r.authorId, status: r.status,
    reasons: reasons.get(r.id) ?? [], openReports: reportCount.get(`${targetType}:${r.id}`) ?? 0, createdAt: r.createdAt.toISOString(),
  });
  return [...posts.map((p) => item('post', p)), ...comments.map((c) => item('comment', c))].sort((a, b) => b.openReports - a.openReports || a.createdAt.localeCompare(b.createdAt));
}

export async function moderationDecision(ctx: CommunityCtx, targetType: 'post' | 'comment', targetId: string, action: 'approve' | 'hide', reason: string) {
  requireModerator(ctx);
  const { prisma, userId } = ctx;
  const next = action === 'approve' ? 'visible' : 'hidden';
  await prisma.$transaction(async (tx) => {
    if (targetType === 'post') {
      const p = await tx.post.findUnique({ where: { id: targetId } });
      if (!p || p.status === 'removed') throw new CommunityError(404, 'post not found');
      await tx.post.update({ where: { id: targetId }, data: { status: next } });
    } else {
      const c = await tx.comment.findUnique({ where: { id: targetId } });
      if (!c || c.status === 'removed') throw new CommunityError(404, 'comment not found');
      await tx.comment.update({ where: { id: targetId }, data: { status: next } });
      const delta = (next === 'visible' ? 1 : 0) - (c.status === 'visible' ? 1 : 0);
      if (delta) await tx.post.update({ where: { id: c.postId }, data: { commentCount: { increment: delta } } });
    }
    await tx.report.updateMany({
      where: { targetType, targetId, status: 'open' },
      data: { status: action === 'hide' ? 'upheld' : 'dismissed', resolvedAt: new Date(), resolvedBy: userId },
    });
    await tx.moderationAction.create({ data: { id: randomUUID(), targetType, targetId, action, reason, actorId: userId } });
  });
  return { ok: true, status: next };
}
