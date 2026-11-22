/**
 * Community (SYSTEMS.md §5): handles, follows, feed, reactions, comments, blocks, reports, moderation.
 * Every read is filtered for the viewer: blocked users are mutually invisible, private and
 * followers-only posts stay with their audience, and unmoderated content is shown only to its author.
 */
import { createHash, randomUUID } from 'node:crypto';
import type {
  CommentDto, CommentsResponse, CommunityMeResponse, CreateCommentInput, CreatePostInput, FeedResponse, FeedTab, HunterCardDto,
  MilestonePayload, ModerationItem, PostDto, PostMediaDto, PublicProfileResponse, ReportInput, SignPostMediaResponse, Sticker,
  UpdateCommunityProfileInput, WorkoutCard,
} from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import { displayStat, powerLevel } from '@lb/engine';
import type { Deps } from '../../lib/types';
import { getWorkout } from '../workouts/service';
import { moderate, localCheck, type Classifier, type ModerationVerdict } from './moderation';
import { isMinor, limits, permissions, type TrustInput } from './trust';

export class CommunityError extends Error {
  constructor(public status: 400 | 403 | 404 | 409 | 429 | 503, message: string) {
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
  /** private object storage for photo posts; absent = photos can't be uploaded or shown */
  storage?: Deps['storage'];
}

type Rank = HunterCardDto['rank'];
const RANK = (r: string | null | undefined): Rank => (r === 'SOVEREIGN' ? 'S' : ((r ?? 'E') as Rank));
/** "My rank" tab and board divisions group neighbouring ranks so beginners see beginners */
export const TIERS: Record<'ED' | 'CB' | 'AS', string[]> = { ED: ['E', 'D'], CB: ['C', 'B'], AS: ['A', 'S', 'SOVEREIGN'] };
const tierOf = (r: Rank): string[] => (r === 'E' || r === 'D' ? TIERS.ED : r === 'C' || r === 'B' ? TIERS.CB : TIERS.AS);
const RESERVED = new Set(['admin', 'administrator', 'moderator', 'mod', 'support', 'limitbreak', 'system', 'official', 'staff', 'help', 'root', 'null', 'undefined', 'me']);
const DAY = 86_400_000;

/* ---------------- viewer ---------------- */

export async function viewer(ctx: CommunityCtx) {
  const { prisma, userId } = ctx;
  const [profile, pub, workouts, upheld] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId }, select: { createdAt: true, birthDate: true, state: { select: { level: true, rank: true } } } }),
    prisma.publicProfile.findUnique({ where: { userId } }),
    prisma.workoutSession.count({ where: { userId } }),
    upheldReportsAgainst(prisma, userId),
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

/** Upheld reports against this hunter (profile, posts or comments) in the last 30 days: one indexed query. */
async function upheldReportsAgainst(prisma: PrismaClient, userId: string) {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "Report" r
    WHERE r."status" = 'upheld' AND r."resolvedAt" >= now() - interval '30 days'
      AND (
        (r."targetType" = 'profile' AND r."targetId" = ${userId})
        -- cast the report side (targetId is validated as a uuid on insert) so the primary keys are used
        OR (r."targetType" = 'post' AND EXISTS (SELECT 1 FROM "Post" p WHERE p."id" = r."targetId"::uuid AND p."authorId" = ${userId}::uuid))
        OR (r."targetType" = 'comment' AND EXISTS (SELECT 1 FROM "Comment" c WHERE c."id" = r."targetId"::uuid AND c."authorId" = ${userId}::uuid))
      )`;
  return rows[0]?.n ?? 0;
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

export const MEDIA_BUCKET = 'community-media';
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
/** Signed read URLs for photos live this long: long enough for a feed session, too short to share around. */
const MEDIA_READ_SECONDS = 600;
const MAX_MEDIA = 4;

/** Photos of these posts as the viewer may see them: visible ones, plus the author's own pending ones. */
async function mediaFor(prisma: PrismaClient, userId: string, rows: PostRow[], storage?: CommunityCtx['storage']): Promise<Map<string, PostMediaDto[]>> {
  const out = new Map<string, PostMediaDto[]>();
  if (!rows.length) return out;
  const authorOf = new Map(rows.map((r) => [r.id, r.authorId]));
  const media = await prisma.postMedia.findMany({ where: { postId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: 'asc' } });
  await Promise.all(media.map(async (m) => {
    const own = authorOf.get(m.postId) === userId;
    if (m.status !== 'visible' && !(own && m.status === 'pending')) return;
    const url = storage ? await storage.signRead(MEDIA_BUCKET, m.storageKey, MEDIA_READ_SECONDS).catch(() => null) : null;
    (out.get(m.postId) ?? out.set(m.postId, []).get(m.postId)!).push({ id: m.id, url, width: m.width, height: m.height, status: m.status as PostMediaDto['status'] });
  }));
  // Promise.all finished in arbitrary order: restore upload order
  const order = new Map(media.map((m, i) => [m.id, i]));
  for (const list of out.values()) list.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return out;
}

async function toDtos(prisma: PrismaClient, userId: string, rows: PostRow[], storage?: CommunityCtx['storage']): Promise<PostDto[]> {
  const [cards, mine, media] = await Promise.all([
    hunterCards(prisma, rows.map((r) => r.authorId)),
    rows.length ? prisma.reaction.findMany({ where: { userId, postId: { in: rows.map((r) => r.id) } } }) : Promise.resolve([]),
    mediaFor(prisma, userId, rows, storage),
  ]);
  const myReaction = new Map(mine.map((m) => [m.postId, m.sticker as Sticker]));
  return rows.flatMap((r) => {
    const author = cards.get(r.authorId);
    if (!author) return [];
    const payload = (r.payload ?? {}) as { milestone?: MilestonePayload; workout?: WorkoutCard };
    return [{
      id: r.id, type: r.type as PostDto['type'], author, body: r.body,
      milestone: payload.milestone ?? null, workout: payload.workout ?? null, media: media.get(r.id) ?? [],
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
    isModerator: v.input.isModerator,
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
    // cursor "snapshotMs:offset": ranking uses a fixed "now" and only posts that existed then, so pages never shift
    const [snapRaw, offRaw] = (cursor ?? '').split(':');
    const snapshot = Number(snapRaw) || Date.now();
    const offset = Number(offRaw) || 0;
    const window = { AND: [base, { visibility: 'public', status: 'visible', createdAt: { gte: new Date(snapshot - 7 * DAY), lte: new Date(snapshot) } }] };
    // candidates: the newest and the most-engaged of the week (an older popular post still ranks)
    const [newest, engaged] = await Promise.all([
      prisma.post.findMany({ where: window, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200 }),
      prisma.post.findMany({ where: window, orderBy: [{ respectCount: 'desc' }, { commentCount: 'desc' }, { id: 'desc' }], take: 200 }),
    ]);
    const rows = [...new Map([...newest, ...engaged].map((p) => [p.id, p])).values()];
    // hot = (respect + 2 × comments + 1) / (ageHours + 2)^1.5
    const hot = (p: PostRow) => (p.respectCount + 2 * p.commentCount + 1) / Math.pow((snapshot - p.createdAt.getTime()) / 3_600_000 + 2, 1.5);
    const ranked = rows.sort((a, b) => hot(b) - hot(a) || b.id.localeCompare(a.id));
    const ordered = capPerAuthor(ranked, PAGE, 2);
    const pageRows = ordered.slice(offset, offset + PAGE);
    const next = offset + pageRows.length;
    return { posts: await toDtos(prisma, userId, pageRows, ctx.storage), nextCursor: next < ordered.length ? `${snapshot}:${next}` : null };
  }

  // cursor "createdAtISO|id": ties on the same millisecond are ordered by id, so nothing is skipped
  const [cIso, cId] = (cursor ?? '').split('|');
  const before = cIso ? new Date(cIso) : undefined;
  const after = before && !Number.isNaN(before.getTime())
    ? [{ OR: [{ createdAt: { lt: before } }, ...(cId ? [{ createdAt: before, id: { lt: cId } }] : [])] }]
    : [];
  const scope =
    tab === 'following'
      ? { authorId: { in: [userId, ...rel.following] } }
      : { visibility: 'public', status: 'visible', authorRank: { in: tierOf(RANK(me?.rank)) } };
  const rows = await prisma.post.findMany({
    where: { AND: [base, scope, ...after] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: PAGE,
  });
  const last = rows.at(-1);
  return { posts: await toDtos(prisma, userId, rows, ctx.storage), nextCursor: rows.length === PAGE && last ? `${last.createdAt.toISOString()}|${last.id}` : null };
}

/**
 * Re-orders a ranked list so no page has more than `max` posts from one author; extras move to the
 * front of the next page (nothing is dropped). Deterministic for the same input, so offsets are stable.
 */
export function capPerAuthor<T extends { authorId: string }>(ranked: T[], pageSize: number, max: number): T[] {
  const out: T[] = [];
  let carry: T[] = [];
  let rest = ranked;
  while (carry.length || rest.length) {
    const queue = [...carry, ...rest];
    const page: T[] = [];
    const deferred: T[] = [];
    const per = new Map<string, number>();
    let i = 0;
    for (; i < queue.length && page.length < pageSize; i++) {
      const p = queue[i]!;
      const n = per.get(p.authorId) ?? 0;
      if (n >= max) deferred.push(p);
      else { per.set(p.authorId, n + 1); page.push(p); }
    }
    // a page that can't be filled (only one prolific author left) takes the rest as-is
    if (!page.length) { out.push(...queue); break; }
    out.push(...page);
    carry = deferred;
    rest = queue.slice(i);
  }
  return out;
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

/** Storage keys come from POST /community/media/sign: `community/{userId}/{file}.jpg`, nothing else. */
export const mediaKeyPrefix = (userId: string) => `community/${userId}/`;
const validMediaKey = (userId: string, key: string) =>
  key.startsWith(mediaKeyPrefix(userId)) && /^[A-Za-z0-9_-]{1,80}\.(jpe?g|png|webp)$/.test(key.slice(mediaKeyPrefix(userId).length));

/**
 * PLACEHOLDER image moderation until a vision provider is wired in (SYSTEMS.md §5.5, photos are public-tier).
 * No pixels are inspected: hunters at T2+ (public-post trust) are let through when their text passed, anyone
 * below that is held for a moderator. Returns the status the photos and the post should start with.
 */
export function moderateImages(trustLevel: number, textAllowed: boolean): { allow: boolean } {
  return { allow: textAllowed && trustLevel >= 2 };
}

export async function createPost(ctx: CommunityCtx, input: CreatePostInput & { body: string }): Promise<PostDto> {
  const { prisma, userId } = ctx;
  const existing = await prisma.post.findUnique({ where: { id: input.id } });
  if (existing) {
    if (existing.authorId !== userId || existing.status === 'removed') throw new CommunityError(409, 'post id already used');
    return (await toDtos(prisma, userId, [existing], ctx.storage))[0]!;
  }
  const v = await viewer(ctx);
  if (!v.can.post) throw new CommunityError(403, v.nextUnlock ?? 'posting is not available on your account');
  const visibility = input.visibility ?? 'followers';
  if (visibility === 'public' && !v.can.postPublic) throw new CommunityError(403, 'public posts unlock at Trusted (level 10, 14 days)');
  const media = input.media ?? [];
  if (media.length) {
    // photos are public-tier content whatever the post's own audience
    if (!v.can.postPublic) throw new CommunityError(403, 'photo posts unlock at Trusted (level 10, 14 days)');
    if (media.length > MAX_MEDIA) throw new CommunityError(400, `at most ${MAX_MEDIA} photos per post`);
    if (new Set(media.map((m) => m.id)).size !== media.length || new Set(media.map((m) => m.storageKey)).size !== media.length) {
      throw new CommunityError(400, 'duplicate photo');
    }
    if (!media.every((m) => validMediaKey(userId, m.storageKey))) throw new CommunityError(400, 'invalid photo key');
    if (await prisma.postMedia.count({ where: { id: { in: media.map((m) => m.id) } } })) throw new CommunityError(409, 'photo id already used');
  }
  const recent = await prisma.post.count({ where: { authorId: userId, type: 'progress', createdAt: { gte: new Date(Date.now() - DAY) } } });
  if (recent >= limits(v.trustLevel).postsPerDay) throw new CommunityError(429, 'daily post limit reached; try again tomorrow');

  let workout: WorkoutCard | null = null;
  if (input.workoutId) {
    const w = await getWorkout(prisma, userId, input.workoutId).catch(() => null);
    if (!w) throw new CommunityError(400, 'workout not found');
    workout = { workoutId: w.id, name: w.name, minutes: w.minutes, workingSets: w.workingSets, volumeKg: w.volumeKg, prs: w.prs };
  }
  const verdict = await moderate(input.body, { classifier: ctx.classifier, trustLevel: v.trustLevel, extraWords: ctx.extraWords });
  // the post stays pending until the text AND every photo is cleared
  const images = media.length ? moderateImages(v.trustLevel, verdict.allow) : { allow: true };
  const row = await prisma.post.create({
    data: {
      id: input.id, authorId: userId, type: 'progress', body: input.body, payload: workout ? { workout } : undefined,
      visibility, status: verdict.allow && images.allow ? 'visible' : 'pending', commentsMode: input.commentsMode ?? 'all', authorRank: v.rank,
      ...(media.length
        ? { media: { create: media.map((m) => ({ id: m.id, storageKey: m.storageKey, width: m.width, height: m.height, status: images.allow ? 'visible' : 'pending' })) } }
        : {}),
    },
  });
  await audit(prisma, 'post', row.id, verdict);
  return (await toDtos(prisma, userId, [row], ctx.storage))[0]!;
}

/** A signed, one-time upload target for one photo. Only hunters who may post photos get one. */
export async function signPostMedia(ctx: CommunityCtx, id: string): Promise<SignPostMediaResponse> {
  const v = await viewer(ctx);
  if (!v.can.postPublic) throw new CommunityError(403, 'photo posts unlock at Trusted (level 10, 14 days)');
  if (!ctx.storage) throw new CommunityError(503, 'photo uploads are not configured');
  const storageKey = `${mediaKeyPrefix(ctx.userId)}${id}.jpg`;
  return { id, uploadUrl: await ctx.storage.signUpload(MEDIA_BUCKET, storageKey), storageKey, maxBytes: MAX_PHOTO_BYTES };
}

export async function deletePost(ctx: CommunityCtx, postId: string) {
  const post = await ctx.prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.authorId !== ctx.userId) throw new CommunityError(404, 'post not found');
  await ctx.prisma.post.updateMany({ where: { id: postId, status: { not: 'removed' } }, data: { status: 'removed' } });
  return { ok: true };
}

/** One post for the post screen (deep links, notifications). */
export async function getPost(ctx: CommunityCtx, postId: string): Promise<PostDto> {
  const { post } = await postVisibleTo(ctx, postId);
  return (await toDtos(ctx.prisma, ctx.userId, [post], ctx.storage))[0]!;
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
  // insert-if-absent: two taps at once can't both count (the primary key decides); the counter moves
  // in the same transaction, so a crash can never leave it out of step with the rows
  await prisma.$transaction(async (tx) => {
    const inserted = await tx.$executeRaw`
      INSERT INTO "Reaction" ("postId", "userId", "sticker", "createdAt") VALUES (${postId}::uuid, ${userId}::uuid, ${sticker}, now())
      ON CONFLICT ("postId", "userId") DO NOTHING`;
    if (inserted === 1) await tx.post.update({ where: { id: postId }, data: { respectCount: { increment: 1 } } });
    else await tx.reaction.updateMany({ where: { postId, userId }, data: { sticker } });
  });
  return { ok: true };
}

export async function unreact(ctx: CommunityCtx, postId: string) {
  const { prisma, userId } = ctx;
  await prisma.$transaction(async (tx) => {
    // only the call that actually deleted the row decrements
    const { count } = await tx.reaction.deleteMany({ where: { postId, userId } });
    if (count) await tx.post.update({ where: { id: postId }, data: { respectCount: { decrement: 1 } } });
  });
  return { ok: true };
}

/* ---------------- comments ---------------- */

/** Top-level comments per page (replies for those parents ride along). */
const COMMENTS_PAGE = 40;

function toCommentDto(
  r: { id: string; postId: string; parentId: string | null; authorId: string; body: string; status: string; createdAt: Date },
  author: HunterCardDto,
  userId: string,
): CommentDto {
  return {
    id: r.id, postId: r.postId, parentId: r.parentId, author, body: r.body,
    status: r.status as CommentDto['status'], mine: r.authorId === userId, createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Page top-level comments oldest → newest (cursor `createdAtISO|id`). Each page includes the replies
 * under those parents so the thread stays intact; clients ask for the next page near the bottom.
 */
export async function listComments(ctx: CommunityCtx, postId: string, cursor?: string): Promise<CommentsResponse> {
  const { prisma, userId } = ctx;
  const { rel } = await postVisibleTo(ctx, postId);
  const visible = {
    authorId: { notIn: rel.hidden },
    OR: [{ status: 'visible' as const }, { authorId: userId, status: { in: ['pending', 'hidden'] } }],
  };
  const [cIso, cId] = (cursor ?? '').split('|');
  const afterAt = cIso ? new Date(cIso) : undefined;
  const after = afterAt && !Number.isNaN(afterAt.getTime())
    ? [{ OR: [{ createdAt: { gt: afterAt } }, ...(cId ? [{ createdAt: afterAt, id: { gt: cId } }] : [])] }]
    : [];
  const tops = await prisma.comment.findMany({
    where: { AND: [{ postId, parentId: null }, visible, ...after] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: COMMENTS_PAGE,
  });
  const topIds = tops.map((r) => r.id);
  const replies = topIds.length
    ? await prisma.comment.findMany({
      where: { AND: [{ postId, parentId: { in: topIds } }, visible] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 300,
    })
    : [];
  const rows = [...tops, ...replies];
  const cards = await hunterCards(prisma, rows.map((r) => r.authorId));
  const shownTop = new Set(tops.filter((r) => cards.has(r.authorId)).map((r) => r.id));
  const comments = rows.flatMap((r) => {
    const author = cards.get(r.authorId);
    return author && (!r.parentId || shownTop.has(r.parentId)) ? [toCommentDto(r, author, userId)] : [];
  });
  const last = tops.at(-1);
  return {
    comments,
    nextCursor: tops.length === COMMENTS_PAGE && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

export async function createComment(ctx: CommunityCtx, postId: string, input: CreateCommentInput & { body: string }): Promise<CommentDto> {
  const { prisma, userId } = ctx;
  const dup = await prisma.comment.findUnique({ where: { id: input.id } });
  if (dup) {
    if (dup.authorId !== userId || dup.postId !== postId) throw new CommunityError(409, 'comment id already used');
    const card = (await hunterCards(prisma, [userId])).get(userId);
    if (!card) throw new CommunityError(409, 'comment id already used');
    return toCommentDto(dup, card, userId);
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
    if (!parent || parent.postId !== postId || parent.status !== 'visible' || rel.hidden.includes(parent.authorId)) throw new CommunityError(404, 'comment not found');
    if (parent.parentId) throw new CommunityError(400, 'you can reply to a comment, not to a reply');
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
  return toCommentDto(row, card, userId);
}

export async function deleteComment(ctx: CommunityCtx, commentId: string) {
  const { prisma, userId } = ctx;
  const c = await prisma.comment.findUnique({ where: { id: commentId }, include: { post: { select: { authorId: true } } } });
  // the author of a comment, or of the post it's on, can remove it
  if (!c || (c.authorId !== userId && c.post.authorId !== userId)) throw new CommunityError(404, 'comment not found');
  await prisma.$transaction(async (tx) => {
    // conditional updates: a double tap or a moderator acting at the same time can't decrement twice
    const wasVisible = await tx.comment.updateMany({ where: { id: commentId, status: 'visible' }, data: { status: 'removed' } });
    if (wasVisible.count) await tx.post.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } });
    else await tx.comment.updateMany({ where: { id: commentId, status: { in: ['pending', 'hidden'] } }, data: { status: 'removed' } });
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
  const target = await targetHunter(ctx.prisma, targetId);
  const rel = await relations(ctx.prisma, ctx.userId);
  if (rel.hidden.includes(targetId)) throw new CommunityError(404, 'hunter not found');
  // private profiles (and every under-18 profile, which is always private) can't be followed:
  // a follow would unlock their followers-only posts. Follow requests come with Friends (Sprint 10).
  if (!target.isPublic) throw new CommunityError(403, 'this hunter’s profile is private');
  const targetProfile = await ctx.prisma.profile.findUnique({ where: { id: targetId }, select: { birthDate: true } });
  if (isMinor(targetProfile?.birthDate ?? null) !== v.isMinor) throw new CommunityError(403, 'this hunter’s profile is private');
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

/** You can only report what you can see. */
async function assertReportable(ctx: CommunityCtx, input: ReportInput) {
  if (input.targetType === 'post') return void (await postVisibleTo(ctx, input.targetId));
  const rel = await relations(ctx.prisma, ctx.userId);
  if (input.targetType === 'profile') {
    const pub = await ctx.prisma.publicProfile.findUnique({ where: { userId: input.targetId } });
    if (!pub || rel.hidden.includes(input.targetId)) throw new CommunityError(404, 'hunter not found');
    return;
  }
  const c = await ctx.prisma.comment.findUnique({ where: { id: input.targetId } });
  if (!c || c.status !== 'visible' || rel.hidden.includes(c.authorId)) throw new CommunityError(404, 'comment not found');
  await postVisibleTo(ctx, c.postId);
}

export async function report(ctx: CommunityCtx, input: ReportInput) {
  if (ctx.isGuest) throw new CommunityError(403, 'save your account to report content');
  const { prisma, userId } = ctx;
  if (!/^[0-9a-f-]{36}$/i.test(input.targetId)) throw new CommunityError(404, 'not found');
  await assertReportable(ctx, input);
  try {
    await prisma.report.create({ data: { id: randomUUID(), reporterId: userId, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details ?? null } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return { ok: true }; // already reported by this hunter
    throw e;
  }
  if (input.targetType === 'post' || input.targetType === 'comment') {
    // only reports from established accounts (3+ days, 3+ workouts) can hold content automatically,
    // so a few throwaway accounts can't take a post down
    const counted = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "Report" r JOIN "Profile" p ON p."id" = r."reporterId"
      WHERE r."targetType" = ${input.targetType} AND r."targetId" = ${input.targetId} AND r."status" = 'open'
        AND p."createdAt" <= now() - interval '3 days'
        AND (SELECT COUNT(*) FROM "WorkoutSession" w WHERE w."userId" = p."id") >= 3`;
    const open = counted[0]?.n ?? 0;
    if (open >= AUTO_HOLD_REPORTS) {
      let held = 0;
      if (input.targetType === 'post') {
        held = (await prisma.post.updateMany({ where: { id: input.targetId, status: 'visible' }, data: { status: 'pending' } })).count;
      } else {
        held = await prisma.$transaction(async (tx) => {
          const { count } = await tx.comment.updateMany({ where: { id: input.targetId, status: 'visible' }, data: { status: 'pending' } });
          if (count) {
            const c = await tx.comment.findUnique({ where: { id: input.targetId }, select: { postId: true } });
            if (c) await tx.post.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } });
          }
          return count;
        });
      }
      if (held) await prisma.moderationAction.create({ data: { id: randomUUID(), targetType: input.targetType, targetId: input.targetId, action: 'auto_hold', reason: `reports:${open}` } });
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
    posts: await toDtos(prisma, userId, rows, ctx.storage),
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
  const actions = ids.length ? await prisma.moderationAction.findMany({ where: { targetType: { in: ['post', 'comment'] }, targetId: { in: ids } }, orderBy: { createdAt: 'asc' } }) : [];
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
    // conditional on the current status, so a concurrent delete/hide can't double-count
    if (targetType === 'post') {
      const { count } = await tx.post.updateMany({ where: { id: targetId, status: { not: 'removed' } }, data: { status: next } });
      if (!count) throw new CommunityError(404, 'post not found');
      // the moderator reviewed the whole post: its pending photos follow the decision
      await tx.postMedia.updateMany({ where: { postId: targetId, status: 'pending' }, data: { status: action === 'approve' ? 'visible' : 'rejected' } });
    } else {
      const c = await tx.comment.findUnique({ where: { id: targetId } });
      if (!c || c.status === 'removed') throw new CommunityError(404, 'comment not found');
      const { count } = await tx.comment.updateMany({ where: { id: targetId, status: c.status }, data: { status: next } });
      if (!count) throw new CommunityError(409, 'the comment changed; reload the queue');
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
