import { zValidator } from '@hono/zod-validator';
import { CreateDuelInput, CreateGuildInput, CreateGuildMessageInput, JoinGuildInput, SendMessageInput } from '@lb/contracts';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { userRateLimit } from '../../middleware/rateLimit';
import { CommunityError } from '../community/service';
import * as s from './service';

const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    // SocialError extends CommunityError, and the community viewer checks throw the latter
    if (e instanceof CommunityError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
};
const ctx = (c: Context<AppEnv>): s.SocialCtx => {
  const d = c.get('deps');
  return { prisma: d.prisma, userId: c.get('userId'), isGuest: c.get('isGuest'), moderatorIds: d.moderatorIds, classifier: d.classifier, extraWords: d.communityWordlist };
};
const id = z.object({ id: z.uuid() });
const target = z.object({ userId: z.uuid() });
const before = z.object({ before: z.iso.datetime().optional() });

/** Guests may read; every write checks "saved account + handle" in the service. */
const writes = userRateLimit('social-write', { limit: 60, windowMs: 60_000 });

export const socialRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .on(['POST', 'PUT', 'DELETE'], '*', writes)
  .use('/messages', userRateLimit('social-dm', { limit: 30, windowMs: 60_000 }))
  .use('/guilds/:id/messages', userRateLimit('social-guild-chat', { limit: 30, windowMs: 60_000 }))
  /* friends */
  .get('/friends', async (c) => c.json(await guard(() => s.listFriends(ctx(c)))))
  .post('/friends', zValidator('json', target), async (c) => c.json(await guard(() => s.connect(ctx(c), c.req.valid('json').userId))))
  .post('/friends/:id/shield', zValidator('param', id), async (c) => c.json(await guard(() => s.giftShield(ctx(c), c.req.valid('param').id))))
  /* follow requests */
  .get('/follow-requests', async (c) => c.json(await guard(() => s.listFollowRequests(ctx(c)))))
  .post('/follow-requests', zValidator('json', target), async (c) => c.json(await guard(() => s.connect(ctx(c), c.req.valid('json').userId))))
  .post('/follow-requests/:id/accept', zValidator('param', id), async (c) => c.json(await guard(() => s.acceptFollowRequest(ctx(c), c.req.valid('param').id))))
  .post('/follow-requests/:id/decline', zValidator('param', id), async (c) => c.json(await guard(() => s.declineFollowRequest(ctx(c), c.req.valid('param').id))))
  .delete('/follow-requests/:id', zValidator('param', id), async (c) => c.json(await guard(() => s.cancelFollowRequest(ctx(c), c.req.valid('param').id))))
  /* duels */
  .get('/duels', async (c) => c.json(await guard(() => s.listDuels(ctx(c)))))
  .post('/duels', zValidator('json', CreateDuelInput), async (c) => c.json(await guard(() => s.createDuel(ctx(c), c.req.valid('json')))))
  .post('/duels/:id/accept', zValidator('param', id), async (c) => c.json(await guard(() => s.acceptDuel(ctx(c), c.req.valid('param').id))))
  .post('/duels/:id/decline', zValidator('param', id), async (c) => c.json(await guard(() => s.declineDuel(ctx(c), c.req.valid('param').id))))
  /* guilds (static paths first so "mine" / "join" are never read as an :id) */
  .get('/guilds', zValidator('query', z.object({ language: z.string().min(2).max(8).optional() })), async (c) => c.json(await guard(() => s.listGuilds(ctx(c), c.req.valid('query').language))))
  .post('/guilds', zValidator('json', CreateGuildInput), async (c) => c.json(await guard(() => s.createGuild(ctx(c), c.req.valid('json')))))
  .post('/guilds/join', zValidator('json', JoinGuildInput), async (c) => c.json(await guard(() => s.joinGuild(ctx(c), c.req.valid('json')))))
  .get('/guilds/mine', async (c) => c.json(await guard(() => s.myGuild(ctx(c)))))
  .get('/guilds/:id', zValidator('param', id), async (c) => c.json(await guard(() => s.getGuild(ctx(c), c.req.valid('param').id))))
  .post('/guilds/:id/leave', zValidator('param', id), async (c) => c.json(await guard(() => s.leaveGuild(ctx(c), c.req.valid('param').id))))
  .get('/guilds/:id/messages', zValidator('param', id), zValidator('query', before), async (c) =>
    c.json(await guard(() => s.listGuildMessages(ctx(c), c.req.valid('param').id, c.req.valid('query').before))),
  )
  .post('/guilds/:id/messages', zValidator('param', id), zValidator('json', CreateGuildMessageInput), async (c) =>
    c.json(await guard(() => s.postGuildMessage(ctx(c), c.req.valid('param').id, c.req.valid('json')))),
  )
  .get('/guilds/:id/raid', zValidator('param', id), async (c) => c.json(await guard(() => s.getRaid(ctx(c), c.req.valid('param').id))))
  /* leagues */
  .get('/league', async (c) => c.json(await guard(() => s.getLeague(ctx(c)))))
  .post('/league/settle', async (c) => c.json(await guard(() => s.settleLastLeagueWeek(ctx(c)))))
  /* DMs */
  .get('/conversations', async (c) => c.json(await guard(() => s.listConversations(ctx(c)))))
  .post('/conversations', zValidator('json', z.object({ peerId: z.uuid() })), async (c) => c.json(await guard(() => s.openConversation(ctx(c), c.req.valid('json').peerId))))
  .get('/conversations/:id/messages', zValidator('param', id), zValidator('query', before), async (c) =>
    c.json(await guard(() => s.listMessages(ctx(c), c.req.valid('param').id, c.req.valid('query').before))),
  )
  .post('/conversations/:id/read', zValidator('param', id), async (c) => c.json(await guard(() => s.markConversationRead(ctx(c), c.req.valid('param').id))))
  .post('/messages', zValidator('json', SendMessageInput), async (c) => c.json(await guard(() => s.sendMessage(ctx(c), c.req.valid('json')))))
  /* Hunter License */
  .get('/license', async (c) => c.json(await guard(() => s.getLicense(ctx(c)))));
