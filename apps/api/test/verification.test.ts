import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { USER, uuid } from './fakeDb';

const MOD = '00000000-0000-4000-8000-0000000000aa';
const ATTEMPT = uuid(500);

function setup(verification = 'required', owner = USER) {
  const rows = [{ id: ATTEMPT, userId: owner, targetRank: 'A', composite: 88.2, passed: true, verified: false, verification, videoKey: null as string | null, submittedAt: null as Date | null, reviewNote: null as string | null, createdAt: new Date() }];
  const prisma: any = {
    trialAttempt: {
      findUnique: async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
      findMany: async ({ where }: any) => rows.filter((r) => r.verification === where.verification),
      update: async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id)!, data),
    },
  };
  const signed: string[] = [];
  const storage = {
    signUpload: async (b: string, p: string) => (signed.push(`up:${b}/${p}`), `https://store.test/up/${p}?token=t`),
    signRead: async (b: string, p: string) => (signed.push(`read:${b}/${p}`), `https://store.test/read/${p}?token=r`),
  };
  const as = (userId: string) => createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId }), storage, moderatorIds: [MOD] });
  const call = (userId: string, method: string, path: string, body?: unknown) =>
    as(userId).request(path, { method, headers: { Authorization: `Bearer ${userId}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { rows, signed, call };
}
const json = async (r: Response) => (await r.json()) as any;

describe('A/S trial verification (SYSTEMS.md §4.4)', () => {
  it('upload → submit → moderator approves → verified', async () => {
    const { rows, signed, call } = setup();
    const up = await json(await call(USER, 'POST', `/progression/trials/${ATTEMPT}/verification/upload`));
    expect(up).toMatchObject({ videoKey: `${USER}/${ATTEMPT}.mp4`, maxBytes: 52428800 });
    expect(signed[0]).toBe(`up:trial-videos/${USER}/${ATTEMPT}.mp4`);
    expect((await call(USER, 'POST', `/progression/trials/${ATTEMPT}/verification`, { videoKey: up.videoKey })).status).toBe(200);
    expect(rows[0]!.verification).toBe('pending');
    const queue = await json(await call(MOD, 'GET', '/progression/reviews'));
    expect(queue.pending[0]).toMatchObject({ attemptId: ATTEMPT, target: 'A' });
    expect(queue.pending[0].videoUrl).toContain('token=r');
    expect((await call(MOD, 'POST', `/progression/reviews/${ATTEMPT}`, { decision: 'verified', note: null })).status).toBe(200);
    expect(rows[0]).toMatchObject({ verification: 'verified', verified: true });
  });

  it('rejects tampered video keys and non-owners', async () => {
    const { call } = setup();
    expect((await call(USER, 'POST', `/progression/trials/${ATTEMPT}/verification`, { videoKey: `someone-else/${ATTEMPT}.mp4` })).status).toBe(400);
    expect((await call(MOD, 'POST', `/progression/trials/${ATTEMPT}/verification/upload`)).status).toBe(404);
  });

  it('only moderators review, never their own, and rejections need a reason', async () => {
    const { rows, call } = setup('pending');
    expect((await call(USER, 'GET', '/progression/reviews')).status).toBe(403);
    expect((await call(MOD, 'POST', `/progression/reviews/${ATTEMPT}`, { decision: 'rejected', note: '' })).status).toBe(400);
    expect((await call(MOD, 'POST', `/progression/reviews/${ATTEMPT}`, { decision: 'rejected', note: 'Push-ups not to depth from 0:12' })).status).toBe(200);
    expect(rows[0]).toMatchObject({ verification: 'rejected', reviewNote: 'Push-ups not to depth from 0:12' });
    // a rejected trial can be re-recorded
    expect((await call(USER, 'POST', `/progression/trials/${ATTEMPT}/verification/upload`)).status).toBe(200);
    const own = setup('pending', MOD);
    expect((await own.call(MOD, 'POST', `/progression/reviews/${ATTEMPT}`, { decision: 'verified', note: null })).status).toBe(403);
  });

  it('nothing to verify for ranks below A', async () => {
    const { call } = setup('none');
    expect((await call(USER, 'POST', `/progression/trials/${ATTEMPT}/verification/upload`)).status).toBe(409);
  });
});
