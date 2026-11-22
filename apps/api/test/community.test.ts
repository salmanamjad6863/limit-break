import { CreatePostInput, Handle, SignPostMediaInput } from '@lb/contracts';
import { describe, expect, it } from 'vitest';
import { localCheck, moderate } from '../src/modules/community/moderation';
import { isMinor, permissions, trustLevel, type TrustInput } from '../src/modules/community/trust';

const NOW = new Date('2026-11-18T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const base: TrustInput = {
  isGuest: false, isModerator: false, createdAt: daysAgo(0), birthDate: new Date('1995-05-05'),
  level: 1, workouts: 0, upheldReports: 0, handle: 'kaze', isPublic: true, now: NOW,
};

describe('trust levels (SYSTEMS.md §5.4)', () => {
  it('climbs with account age, workouts and level', () => {
    expect(trustLevel(base)).toBe(0);
    expect(trustLevel({ ...base, createdAt: daysAgo(3), workouts: 3 })).toBe(1);
    expect(trustLevel({ ...base, createdAt: daysAgo(14), workouts: 3, level: 10 })).toBe(2);
    expect(trustLevel({ ...base, createdAt: daysAgo(60), workouts: 40, level: 25 })).toBe(3);
  });
  it('an upheld report drops one level; moderators are T3', () => {
    expect(trustLevel({ ...base, createdAt: daysAgo(60), workouts: 40, level: 25, upheldReports: 1 })).toBe(2);
    expect(trustLevel({ ...base, isModerator: true })).toBe(3);
  });
  it('maps levels to permissions', () => {
    expect(permissions(base).can).toMatchObject({ react: true, follow: true, comment: false, post: false });
    expect(permissions({ ...base, createdAt: daysAgo(3), workouts: 3 }).can).toMatchObject({ comment: true, post: true, postPublic: false });
    expect(permissions({ ...base, createdAt: daysAgo(14), workouts: 3, level: 10 }).can).toMatchObject({ postPublic: true, appearOnBoards: true });
  });
  it('guests and hunters without a handle are read-only', () => {
    expect(Object.values(permissions({ ...base, isGuest: true }).can).every((v) => !v)).toBe(true);
    expect(Object.values(permissions({ ...base, handle: null }).can).every((v) => !v)).toBe(true);
  });
  it('under-18s (or unknown age) get reactions and follows only, never boards', () => {
    expect(isMinor(new Date('2010-01-01'), NOW)).toBe(true);
    expect(isMinor(null, NOW)).toBe(true);
    const p = permissions({ ...base, birthDate: new Date('2010-01-01'), createdAt: daysAgo(90), workouts: 50, level: 30 });
    expect(p.can).toEqual({ react: true, follow: true, comment: false, post: false, postPublic: false, appearOnBoards: false });
  });
});

describe('moderation: local checks', () => {
  it('lets normal fitness talk through, including undirected swearing', () => {
    expect(localCheck('Hit a 100kg squat today, legs are destroyed')).toBeNull();
    expect(localCheck('This workout was damn hard but worth it')).toBeNull();
  });
  it('holds harassment, self-harm, scams, links and contact details', () => {
    expect(localCheck('lol just kys')?.categories).toContain('harassment');
    expect(localCheck('k1ll yourse1f')?.categories).toContain('harassment');
    expect(localCheck('I want to starve myself until I am thin')?.categories).toContain('self_harm');
    expect(localCheck('Guaranteed profit, DM me on telegram')?.categories).toEqual(expect.arrayContaining(['scam', 'spam']));
    expect(localCheck('visit www.cheapsupps.xyz')?.categories).toContain('spam');
    expect(localCheck('call me +1 415 555 0101')?.categories).toContain('personal_info');
    expect(localCheck('mail me at gym@bro.com')?.categories).toContain('personal_info');
  });
  it('supports an extra wordlist matched on whole words', () => {
    expect(localCheck('you are a zorblax', ['zorblax'])?.categories).toContain('hate');
    expect(localCheck('zorblaxian training plan', ['zorblax'])).toBeNull();
  });
});

describe('moderation pipeline', () => {
  it('uses the classifier verdict when available', async () => {
    const deny = async () => ({ allow: false, categories: ['harassment' as const], severity: 'high' as const, source: 'classifier' as const });
    expect((await moderate('you are pathetic', { classifier: deny, trustLevel: 3 })).allow).toBe(false);
  });
  it('wordlist hits never reach the classifier', async () => {
    let called = false;
    const allow = async () => ((called = true), { allow: true, categories: [], severity: 'none' as const, source: 'classifier' as const });
    expect((await moderate('kys', { classifier: allow, trustLevel: 3 })).allow).toBe(false);
    expect(called).toBe(false);
  });
  it('classifier down or unset: new accounts are held, established ones go through', async () => {
    const broken = async () => { throw new Error('timeout'); };
    expect((await moderate('great session', { classifier: broken, trustLevel: 1 })).allow).toBe(false);
    expect((await moderate('great session', { classifier: broken, trustLevel: 2 })).allow).toBe(true);
    expect((await moderate('great session', { trustLevel: 0 })).allow).toBe(false);
    expect((await moderate('great session', { trustLevel: 2 })).source).toBe('unavailable');
  });
});

describe('community contracts', () => {
  it('handles: 3–20 chars, lowercase, letters/digits/_/., no edge or double dots', () => {
    expect(Handle.parse('Kaze.Runs')).toBe('kaze.runs');
    for (const bad of ['ab', 'a'.repeat(21), '.kaze', 'kaze.', 'ka..ze', 'ka ze', 'kazé']) expect(Handle.safeParse(bad).success).toBe(false);
  });
  it('posts: 1–500 chars, followers-only by default', () => {
    const p = CreatePostInput.parse({ id: '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b', body: '  first 5K!  ' });
    expect(p).toMatchObject({ body: 'first 5K!', visibility: 'followers', commentsMode: 'all', workoutId: null });
    expect(CreatePostInput.safeParse({ id: '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b', body: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('global feed paging (max 2 per author per page)', async () => {
  const { capPerAuthor } = await import('../src/modules/community/service');
  it('never drops posts, keeps the cap and is deterministic', () => {
    // author "a" posts a lot and ranks high
    const ranked = [...'aaaaabcaaddeffgaah'].map((authorId, i) => ({ authorId, id: String(i) }));
    const out = capPerAuthor(ranked, 5, 2);
    expect(out.map((p) => p.id).sort()).toEqual(ranked.map((p) => p.id).sort());
    for (let i = 0; i + 5 <= out.length; i += 5) {
      const page = out.slice(i, i + 5);
      const counts = new Map<string, number>();
      for (const p of page) counts.set(p.authorId, (counts.get(p.authorId) ?? 0) + 1);
      // full pages respect the cap while other authors are still available
      if (new Set(out.slice(i).map((p) => p.authorId)).size > 2) expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    }
    expect(capPerAuthor(ranked, 5, 2)).toEqual(out);
  });
});

describe('photo posts', async () => {
  const { createPost, signPostMedia, moderateImages, mediaKeyPrefix } = await import('../src/modules/community/service');
  const ME = '00000000-0000-4000-8000-000000000001';
  const POST = '00000000-0000-4000-8000-0000000000a1';
  const M1 = '00000000-0000-4000-8000-0000000000b1';
  const M2 = '00000000-0000-4000-8000-0000000000b2';

  /** `trust2` = 20 days old, level 12, 10 workouts (T2); otherwise a 4-day-old T1 hunter. */
  function fake(trust2: boolean) {
    const created: any[] = [];
    const media: any[] = [];
    const prisma: any = {
      profile: {
        findUnique: async () => ({ createdAt: daysAgo(trust2 ? 20 : 4), birthDate: new Date('1995-05-05'), state: { level: trust2 ? 12 : 3, rank: 'D' } }),
      },
      publicProfile: {
        findUnique: async () => ({ userId: ME, handle: 'kaze', isPublic: true, bio: null }),
        findMany: async () => [{ userId: ME, handle: 'kaze', profile: { heroId: null, heroClass: null, state: { level: 12, rank: 'D', str: 10, agi: 10, end: 10, vit: 10, spi: 10 } } }],
      },
      workoutSession: { count: async () => 10 },
      $queryRaw: async () => [{ n: 0 }],
      post: {
        findUnique: async () => null,
        count: async () => 0,
        create: async ({ data }: any) => {
          const { media: m, ...row } = data;
          const r = { respectCount: 0, commentCount: 0, createdAt: NOW, ...row };
          created.push({ ...r, media: m?.create ?? [] });
          for (const x of m?.create ?? []) media.push({ ...x, postId: row.id, createdAt: NOW });
          return r;
        },
      },
      postMedia: {
        count: async ({ where }: any) => media.filter((m) => where.id.in.includes(m.id)).length,
        findMany: async ({ where }: any) => media.filter((m) => where.postId.in.includes(m.postId)),
      },
      reaction: { findMany: async () => [] },
      moderationAction: { create: async () => ({}) },
    };
    const storage = {
      signUpload: async (bucket: string, path: string) => `https://up.test/${bucket}/${path}`,
      signRead: async (bucket: string, path: string) => `https://read.test/${bucket}/${path}`,
    };
    return { created, prisma, storage, ctx: { prisma, userId: ME, isGuest: false, storage } as any };
  }
  const photo = (id: string, key = `${mediaKeyPrefix(ME)}${id}.jpg`) => ({ id, storageKey: key, width: 1080, height: 1350 });

  it('contracts: up to 4 photos, default none', () => {
    expect(CreatePostInput.parse({ id: POST, body: 'hi' }).media).toEqual([]);
    expect(CreatePostInput.safeParse({ id: POST, body: 'hi', media: Array.from({ length: 5 }, () => photo(M1)) }).success).toBe(false);
    expect(SignPostMediaInput.safeParse({ id: M1 }).success).toBe(true);
  });

  it('image moderation stub: T2+ with clean text passes, anything lower is held', () => {
    expect(moderateImages(2, true).allow).toBe(true);
    expect(moderateImages(3, true).allow).toBe(true);
    expect(moderateImages(1, true).allow).toBe(false);
    expect(moderateImages(2, false).allow).toBe(false);
  });

  it('T2 hunters post photos: rows are created visible and the DTO carries signed read URLs', async () => {
    const f = fake(true);
    const dto = await createPost(f.ctx, CreatePostInput.parse({ id: POST, body: 'back day', visibility: 'public', media: [photo(M1), photo(M2)] }) as any);
    expect(f.created[0].media.map((m: any) => m.status)).toEqual(['visible', 'visible']);
    expect(f.created[0].status).toBe('visible');
    expect(dto.media.map((m) => m.id)).toEqual([M1, M2]);
    expect(dto.media[0]).toMatchObject({ status: 'visible', width: 1080, url: `https://read.test/community-media/community/${ME}/${M1}.jpg` });
  });

  it('without storage the photo is still listed, with a null url', async () => {
    const f = fake(true);
    const dto = await createPost({ ...f.ctx, storage: undefined }, CreatePostInput.parse({ id: POST, body: 'legs', media: [photo(M1)] }) as any);
    expect(dto.media[0]!.url).toBeNull();
  });

  it('photos need public-post trust (T2), whatever the post audience', async () => {
    const f = fake(false);
    await expect(createPost(f.ctx, CreatePostInput.parse({ id: POST, body: 'legs', media: [photo(M1)] }) as any)).rejects.toMatchObject({ status: 403 });
    expect(f.created).toHaveLength(0);
    // text-only posts are unaffected
    await expect(createPost(f.ctx, CreatePostInput.parse({ id: POST, body: 'legs' }) as any)).resolves.toMatchObject({ media: [] });
  });

  it('storage keys must live under community/{userId}/', async () => {
    const f = fake(true);
    for (const key of [`community/${'00000000-0000-4000-8000-0000000000ff'}/${M1}.jpg`, `trial-videos/${ME}/x.jpg`, `${mediaKeyPrefix(ME)}../x.jpg`, `${mediaKeyPrefix(ME)}a/b.jpg`]) {
      await expect(createPost(f.ctx, CreatePostInput.parse({ id: POST, body: 'hi', media: [photo(M1, key)] }) as any), key).rejects.toMatchObject({ status: 400 });
    }
    expect(f.created).toHaveLength(0);
  });

  it('signs an upload at community/{userId}/{id}.jpg in the community-media bucket; T1 and no-storage are refused', async () => {
    const f = fake(true);
    await expect(signPostMedia(f.ctx, M1)).resolves.toEqual({
      id: M1, storageKey: `community/${ME}/${M1}.jpg`, uploadUrl: `https://up.test/community-media/community/${ME}/${M1}.jpg`, maxBytes: 8 * 1024 * 1024,
    });
    await expect(signPostMedia({ ...f.ctx, storage: undefined }, M1)).rejects.toMatchObject({ status: 503 });
    await expect(signPostMedia(fake(false).ctx, M1)).rejects.toMatchObject({ status: 403 });
  });
});

describe('scale fixes (docs/plans/COMMUNITY_REVIEW.md)', async () => {
  const { board, clearBoardCache } = await import('../src/modules/community/boards');
  const { FeedTab } = await import('@lb/contracts');
  const { z } = await import('zod');

  it('a keyset cursor (ISO time | uuid) fits the feed route limit', () => {
    const cursor = `${new Date('2026-11-18T12:00:00.000Z').toISOString()}|0b8f6c1e-4a1f-4c3e-9b5e-2f7d1a2b3c4d`;
    expect(cursor.length).toBe(61);
    // the same schema the /feed route validates with
    const q = z.object({ tab: FeedTab.default('global'), cursor: z.string().max(100).optional() });
    expect(q.safeParse({ tab: 'following', cursor }).success).toBe(true);
  });

  it('boards are computed once and served from cache for every viewer', async () => {
    clearBoardCache();
    let rawCalls = 0;
    const prisma: any = {
      $queryRaw: async () => { rawCalls++; return [{ userId: '11111111-1111-4111-8111-111111111111', score: 42, place: 1 }]; },
      publicProfile: { findMany: async () => [] },
    };
    const viewer = { userId: '22222222-2222-4222-8222-222222222222', ineligible: null };
    await board(prisma, viewer, 'xp', 'all', '2026-11');
    const afterFirst = rawCalls;
    expect(afterFirst).toBeGreaterThan(0);
    // same viewer again: no new aggregation
    await board(prisma, viewer, 'xp', 'all', '2026-11');
    expect(rawCalls).toBe(afterFirst);
    // a different viewer who can't appear on the board reuses the cached top list
    await board(prisma, { userId: '33333333-3333-4333-8333-333333333333', ineligible: 'not eligible' }, 'xp', 'all', '2026-11');
    expect(rawCalls).toBe(afterFirst);
    clearBoardCache();
  });
});
