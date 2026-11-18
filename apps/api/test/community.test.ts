import { CreatePostInput, Handle } from '@lb/contracts';
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
