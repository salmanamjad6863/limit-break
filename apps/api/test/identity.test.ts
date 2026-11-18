import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { fakeDb, USER } from './fakeDb';

const call = (prisma: unknown, method: string, path: string, body?: unknown) =>
  createApp({ prisma: prisma as never, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) }).request(path, {
    method,
    headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('PUT /me/identity', () => {
  it('renames the hunter and swaps the sigil without changing class', async () => {
    const { prisma, db } = fakeDb();
    const res = await call(prisma, 'PUT', '/me/identity', { hunterName: 'Akira', heroId: 'jin' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { hunterName: string; heroId: string; heroClass: string };
    expect(json).toMatchObject({ hunterName: 'Akira', heroId: 'jin', heroClass: 'HYBRID' });
    expect(db.profile.heroClass).toBe('HYBRID');
    expect(db.profile.hunterName).toBe('Akira');
    expect(db.profile.heroId).toBe('jin');
  });

  it('rejects an unknown hero', async () => {
    const { prisma } = fakeDb();
    const res = await call(prisma, 'PUT', '/me/identity', { hunterName: 'Akira', heroId: 'naruto' });
    expect(res.status).toBe(400);
  });

  it('rejects a short name', async () => {
    const { prisma } = fakeDb();
    const res = await call(prisma, 'PUT', '/me/identity', { hunterName: 'A', heroId: 'ren' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /me/notifications', () => {
  it('updates quest time and opt-in', async () => {
    const { prisma, db } = fakeDb();
    const res = await call(prisma, 'PUT', '/me/notifications', { notificationsOptIn: false, questTime: '21:00' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { notificationsOptIn: boolean; questTime: string };
    expect(json).toMatchObject({ notificationsOptIn: false, questTime: '21:00' });
    expect(db.profile.questTime).toBe('21:00');
    expect(db.profile.notificationsOptIn).toBe(false);
  });
});
