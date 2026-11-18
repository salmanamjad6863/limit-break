import { zValidator } from '@hono/zod-validator';
import { BoardId, CreateCommentInput, CreatePostInput, Division, FeedTab, ModerationDecisionInput, ReactInput, ReportInput, UpdateCommunityProfileInput } from '@lb/contracts';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../../lib/types';
import { requireAuth } from '../../middleware/auth';
import { board } from './boards';
import * as s from './service';

const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof s.CommunityError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
};
const ctx = (c: Context<AppEnv>): s.CommunityCtx => {
  const d = c.get('deps');
  return { prisma: d.prisma, userId: c.get('userId'), isGuest: c.get('isGuest'), moderatorIds: d.moderatorIds, classifier: d.classifier, extraWords: d.communityWordlist };
};
const uuid = z.object({ id: z.uuid() });

/**
 * Guests can read (feed, profiles, boards); every write checks the hunter's permissions
 * (saved account, handle, trust level, age) in the service.
 */
export const communityRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/me', async (c) => c.json(await guard(() => s.getCommunityMe(ctx(c)))))
  .put('/me', zValidator('json', UpdateCommunityProfileInput), async (c) => c.json(await guard(() => s.updateCommunityProfile(ctx(c), c.req.valid('json')))))
  .get('/feed', zValidator('query', z.object({ tab: FeedTab.default('global'), cursor: z.string().max(40).optional() })), async (c) => {
    const q = c.req.valid('query');
    return c.json(await guard(() => s.feed(ctx(c), q.tab, q.cursor)));
  })
  .post('/posts', zValidator('json', CreatePostInput), async (c) => c.json(await guard(() => s.createPost(ctx(c), c.req.valid('json')))))
  .delete('/posts/:id', zValidator('param', uuid), async (c) => c.json(await guard(() => s.deletePost(ctx(c), c.req.valid('param').id))))
  .put('/posts/:id/reaction', zValidator('param', uuid), zValidator('json', ReactInput), async (c) =>
    c.json(await guard(() => s.react(ctx(c), c.req.valid('param').id, c.req.valid('json').sticker))),
  )
  .delete('/posts/:id/reaction', zValidator('param', uuid), async (c) => c.json(await guard(() => s.unreact(ctx(c), c.req.valid('param').id))))
  .get('/posts/:id/comments', zValidator('param', uuid), async (c) => c.json({ comments: await guard(() => s.listComments(ctx(c), c.req.valid('param').id)) }))
  .post('/posts/:id/comments', zValidator('param', uuid), zValidator('json', CreateCommentInput), async (c) =>
    c.json(await guard(() => s.createComment(ctx(c), c.req.valid('param').id, c.req.valid('json')))),
  )
  .delete('/comments/:id', zValidator('param', uuid), async (c) => c.json(await guard(() => s.deleteComment(ctx(c), c.req.valid('param').id))))
  .put('/follows/:id', zValidator('param', uuid), async (c) => c.json(await guard(() => s.follow(ctx(c), c.req.valid('param').id))))
  .delete('/follows/:id', zValidator('param', uuid), async (c) => c.json(await guard(() => s.unfollow(ctx(c), c.req.valid('param').id))))
  .put('/blocks/:id', zValidator('param', uuid), async (c) => c.json(await guard(() => s.block(ctx(c), c.req.valid('param').id))))
  .delete('/blocks/:id', zValidator('param', uuid), async (c) => c.json(await guard(() => s.unblock(ctx(c), c.req.valid('param').id))))
  .post('/reports', zValidator('json', ReportInput), async (c) => c.json(await guard(() => s.report(ctx(c), c.req.valid('json')))))
  .get('/hunters/:handle', zValidator('param', z.object({ handle: z.string().min(3).max(20) })), async (c) =>
    c.json(await guard(() => s.publicProfile(ctx(c), c.req.valid('param').handle))),
  )
  .get('/boards/:board', zValidator('param', z.object({ board: BoardId })), zValidator('query', z.object({ division: Division.default('all'), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() })), async (c) => {
    const me = await guard(() => s.getCommunityMe(ctx(c)));
    const ineligible = me.isGuest ? 'Save your account to appear on the boards.'
      : !me.handle ? 'Pick a handle to appear on the boards.'
      : me.isMinor ? 'Boards are for hunters 18 and over.'
      : !me.isPublic ? 'Make your profile public to appear on the boards.'
      : !me.can.appearOnBoards ? 'Your account needs to be 14 days old to appear on the boards.'
      : null;
    const q = c.req.valid('query');
    return c.json(await guard(() => board(c.get('deps').prisma, { userId: c.get('userId'), ineligible }, c.req.valid('param').board, q.division, q.month)));
  })
  .get('/moderation', async (c) => c.json({ items: await guard(() => s.moderationQueue(ctx(c))) }))
  .post('/moderation/:type/:id', zValidator('param', z.object({ type: z.enum(['post', 'comment']), id: z.uuid() })), zValidator('json', ModerationDecisionInput), async (c) => {
    const p = c.req.valid('param');
    const j = c.req.valid('json');
    return c.json(await guard(() => s.moderationDecision(ctx(c), p.type, p.id, j.action, j.reason)));
  });
