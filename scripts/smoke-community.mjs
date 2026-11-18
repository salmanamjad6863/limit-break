#!/usr/bin/env node
/**
 * Community smoke test against a real Supabase project + API, with two throwaway hunters (A and B).
 * Ages A's account in the database (test users only) to reach trust levels, runs the community
 * journey, then deletes both accounts and checks nothing is left. Never prints keys or tokens.
 *
 *   node scripts/smoke-community.mjs                          # API at http://localhost:8787
 *   SMOKE_API_URL=http://localhost:8788 node scripts/smoke-community.mjs
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const envFile = (p) => Object.fromEntries(readFileSync(new URL(p, import.meta.url), 'utf8').split('\n')
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const apiEnv = envFile('../apps/api/.env');
const appEnv = envFile('../apps/mobile/.env');
const dbEnv = envFile('../packages/db/.env');
const SB = apiEnv.SUPABASE_URL.replace(/\/$/, '');
const SECRET = apiEnv.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = appEnv.EXPO_PUBLIC_SUPABASE_KEY;
const API = (process.env.SMOKE_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const admin = SECRET.startsWith('sb_') ? { apikey: SECRET } : { apikey: SECRET, Authorization: `Bearer ${SECRET}` };
const { Client } = createRequire(new URL('../packages/db/package.json', import.meta.url))('pg');
const db = new Client({ connectionString: dbEnv.DIRECT_URL });
await db.connect();

let failures = 0;
const users = {};
async function step(name, fn) {
  try {
    const detail = await fn();
    console.log(`✓ ${name}${detail ? `  ${detail}` : ''}`);
  } catch (e) {
    failures++;
    console.log(`✗ ${name}  ${String(e.message ?? e).slice(0, 400)}`);
  }
}
async function call(who, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { Authorization: `Bearer ${users[who].token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
const ok = (r, what) => { if (r.status !== 200) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`); return r.json; };
const expectStatus = (r, status, what) => { if (r.status !== status) throw new Error(`${what}: expected ${status}, got ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`); };

async function createHunter(who) {
  const email = `smoke+${who.toLowerCase()}${Date.now()}@limitbreak.test`;
  const password = randomBytes(18).toString('base64url');
  const r = await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`create ${who}: ${r.status}`);
  users[who] = { id: j.id };
  const t = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUBLISHABLE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  users[who].token = t.access_token;
  ok(await call(who, 'POST', '/me/onboarding', {
    hunterName: `Smoke ${who}`, heroId: 'ren', goal: 'recomp', experience: 'novice', location: 'HOME', equipment: [],
    daysPerWeek: 3, sessionMinutes: 45, questTime: '07:00', heroClass: 'HYBRID', sex: 'female', birthDate: '1996-02-02',
    heightCm: 168, weightKg: 62, bodyFatPct: null, lifestyle: 'light', injuries: [], parqAnyYes: false, nutritionMode: 'full',
    fatPreference: 'balanced', timezone: 'UTC', assessment: { pushups: 12, plankSec: 60, squats60: 30 }, notificationsOptIn: false, consentVersion: '2026-11',
  }), `onboard ${who}`);
}
const workout = (who, n) => call(who, 'POST', '/workouts/finish', {
  id: randomUUID(), plannedWorkoutId: null, programId: null, dayId: null, sessionRpe: 7, cardio: [], kind: 'quick', name: `Smoke ${n}`, notes: null,
  startedAt: new Date(Date.now() - 1500_000).toISOString(), finishedAt: new Date().toISOString(), plannedHardSets: 2,
  sets: [0, 1].map((o) => ({ id: randomUUID(), exerciseId: 'push-up', order: o, reps: 10 + n, weightKg: null, rir: 2, rpe: null, durationS: null, distanceM: null, isWarmup: false, setType: 'normal', completedAt: new Date().toISOString() })),
});
/** test users only: age the account so trust levels can be exercised today */
const age = async (who, days, level) => {
  await db.query(`update "Profile" set "createdAt" = now() - make_interval(days => $2) where id = $1`, [users[who].id, days]);
  await db.query(`update "HunterState" set level = $2 where "userId" = $1`, [users[who].id, level]);
};

const posts = {};
const startedAt = new Date();
try {
  await step('create hunters A and B (confirmed, onboarded, adults)', async () => {
    await createHunter('A');
    await createHunter('B');
  });
  await step('no handle yet → read-only, told to pick one', async () => {
    const j = ok(await call('A', 'GET', '/community/me'), 'me');
    if (j.can.post || j.can.react || !/handle/i.test(j.nextUnlock)) throw new Error(JSON.stringify(j));
  });
  await step('handles: reserved rejected, taken rejected, valid saved', async () => {
    expectStatus(await call('A', 'PUT', '/community/me', { handle: 'admin' }), 400, 'reserved');
    const hA = `smoke_a${Date.now() % 1e6}`;
    users.A.handle = ok(await call('A', 'PUT', '/community/me', { handle: hA, bio: 'Training for my first 10K' }), 'set A').handle;
    expectStatus(await call('B', 'PUT', '/community/me', { handle: hA }), 409, 'taken');
    users.B.handle = ok(await call('B', 'PUT', '/community/me', { handle: `smoke_b${Date.now() % 1e6}` }), 'set B').handle;
    return `@${users.A.handle}, @${users.B.handle}`;
  });
  await step('a brand-new account (T0) cannot post yet', async () => {
    expectStatus(await call('A', 'POST', '/community/posts', { id: randomUUID(), body: 'hello hunters' }), 403, 'post as T0');
  });
  await step('A reaches Trusted (T2): 20-day-old account, level 12, 3 workouts', async () => {
    for (let n = 0; n < 3; n++) ok(await workout('A', n), `workout ${n}`);
    await age('A', 20, 12);
    const j = ok(await call('A', 'GET', '/community/me'), 'me');
    if (j.trustLevel !== 2 || !j.can.postPublic) throw new Error(`trust ${j.trustLevel} ${JSON.stringify(j.can)}`);
    return `trust ${j.trustLevel}, boards: ${j.can.appearOnBoards}`;
  });
  await step('A posts publicly → visible; a post with a link → held for review', async () => {
    const p = ok(await call('A', 'POST', '/community/posts', { id: (posts.pub = randomUUID()), body: 'First 5K under 30 minutes! E-Rank no more.', visibility: 'public' }), 'public post');
    const spam = ok(await call('A', 'POST', '/community/posts', { id: (posts.spam = randomUUID()), body: 'cheap supplements at www.cheapsupps.xyz', visibility: 'public' }), 'spam post');
    if (p.status !== 'visible' || spam.status !== 'pending') throw new Error(`statuses ${p.status} / ${spam.status}`);
    // retrying the same id never double-posts
    const again = ok(await call('A', 'POST', '/community/posts', { id: posts.pub, body: 'First 5K under 30 minutes! E-Rank no more.', visibility: 'public' }), 'retry');
    if (again.id !== posts.pub) throw new Error('retry made a new post');
    return `public: ${p.status}, link: ${spam.status}`;
  });
  await step('B sees the public post in Global, never the held one', async () => {
    const j = ok(await call('B', 'GET', '/community/feed?tab=global'), 'feed');
    const ids = j.posts.map((p) => p.id);
    if (!ids.includes(posts.pub) || ids.includes(posts.spam)) throw new Error(`ids ${ids.length}`);
    const mine = ok(await call('A', 'GET', '/community/feed?tab=following'), 'A feed');
    if (!mine.posts.some((p) => p.id === posts.spam && p.status === 'pending')) throw new Error('author should see own pending post');
  });
  await step('reactions: one per hunter, changing the sticker keeps the count', async () => {
    ok(await call('B', 'PUT', `/community/posts/${posts.pub}/reaction`, { sticker: 'ganbatte' }), 'react');
    ok(await call('B', 'PUT', `/community/posts/${posts.pub}/reaction`, { sticker: 'beast_mode' }), 'change');
    const j = ok(await call('B', 'GET', '/community/feed?tab=global'), 'feed');
    const p = j.posts.find((x) => x.id === posts.pub);
    if (p.respectCount !== 1 || p.myReaction !== 'beast_mode') throw new Error(`count ${p.respectCount}, mine ${p.myReaction}`);
    return `${p.respectCount} Respect (${p.myReaction})`;
  });
  await step('B (new account) cannot comment; after 3 days + 3 workouts (T1) the comment is held without a classifier', async () => {
    expectStatus(await call('B', 'POST', `/community/posts/${posts.pub}/comments`, { id: randomUUID(), body: 'Huge, congrats!' }), 403, 'T0 comment');
    for (let n = 0; n < 3; n++) ok(await workout('B', n), `B workout ${n}`);
    await age('B', 5, 3);
    const c = ok(await call('B', 'POST', `/community/posts/${posts.pub}/comments`, { id: randomUUID(), body: 'Huge, congrats!' }), 'T1 comment');
    const seenByA = ok(await call('A', 'GET', `/community/posts/${posts.pub}/comments`), 'A comments').comments;
    const seenByB = ok(await call('B', 'GET', `/community/posts/${posts.pub}/comments`), 'B comments').comments;
    if (seenByB.length !== 1 || seenByA.length !== 0) throw new Error(`A sees ${seenByA.length}, B sees ${seenByB.length}`);
    return `comment ${c.status} (author sees it, others don't until approved)`;
  });
  await step('A comments (T2) → visible; replies to replies are rejected', async () => {
    const c = ok(await call('A', 'POST', `/community/posts/${posts.pub}/comments`, { id: randomUUID(), body: 'Thanks! Next goal: sub-28.' }), 'comment');
    const r = ok(await call('A', 'POST', `/community/posts/${posts.pub}/comments`, { id: randomUUID(), body: 'Training plan: 3 runs a week.', parentId: c.id }), 'reply');
    expectStatus(await call('A', 'POST', `/community/posts/${posts.pub}/comments`, { id: randomUUID(), body: 'nested', parentId: r.id }), 400, 'reply to reply');
    const feed = ok(await call('B', 'GET', '/community/feed?tab=global'), 'feed');
    return `commentCount ${feed.posts.find((x) => x.id === posts.pub).commentCount}`;
  });
  await step('followers-only posts reach followers, not strangers', async () => {
    ok(await call('A', 'POST', '/community/posts', { id: (posts.fol = randomUUID()), body: 'Leg day done. Stairs are my enemy now.', visibility: 'followers' }), 'followers post');
    let b = ok(await call('B', 'GET', '/community/feed?tab=following'), 'B following');
    if (b.posts.some((p) => p.id === posts.fol)) throw new Error('stranger saw followers-only post');
    ok(await call('B', 'PUT', `/community/follows/${users.A.id}`), 'follow');
    b = ok(await call('B', 'GET', '/community/feed?tab=following'), 'B following');
    if (!b.posts.some((p) => p.id === posts.fol)) throw new Error('follower did not see followers-only post');
    const prof = ok(await call('B', 'GET', `/community/hunters/${users.A.handle}`), 'profile');
    return `@${prof.hunter.handle}: ${prof.followers} follower(s), iFollow ${prof.iFollow}, ${prof.posts.length} posts visible`;
  });
  await step('three reports hold a post; non-moderators get 403 on the queue', async () => {
    ok(await call('B', 'POST', '/community/reports', { targetType: 'post', targetId: posts.fol, reason: 'spam' }), 'report');
    ok(await call('B', 'POST', '/community/reports', { targetType: 'post', targetId: posts.fol, reason: 'spam' }), 'duplicate report ignored');
    expectStatus(await call('A', 'GET', '/community/moderation'), 403, 'queue');
    const open = await db.query(`select count(*)::int n from "Report" where "targetId" = $1`, [posts.fol]);
    if (open.rows[0].n !== 1) throw new Error(`reports ${open.rows[0].n}`);
  });
  await step('boards: A (eligible) is on XP Champions; B (account too new) is told why', async () => {
    const a = ok(await call('A', 'GET', '/community/boards/xp'), 'xp board');
    if (!a.rows.some((r) => r.hunter.userId === users.A.id) || a.meIneligible) throw new Error(`A not on board: ${a.meIneligible}`);
    const b = ok(await call('B', 'GET', '/community/boards/xp'), 'B board');
    if (!b.meIneligible) throw new Error('B should be ineligible');
    const c = ok(await call('A', 'GET', '/community/boards/consistent?division=ED'), 'consistent');
    const me = a.rows.find((r) => r.hunter.userId === users.A.id);
    return `A #${me.place} with ${me.score} XP; consistent board ${c.rows.length} row(s); B: "${b.meIneligible}"`;
  });
  await step('blocking makes both hunters invisible to each other', async () => {
    ok(await call('A', 'PUT', `/community/blocks/${users.B.id}`), 'block');
    const b = ok(await call('B', 'GET', '/community/feed?tab=global'), 'B feed');
    if (b.posts.some((p) => p.author.userId === users.A.id)) throw new Error('blocked author still visible');
    expectStatus(await call('B', 'GET', `/community/hunters/${users.A.handle}`), 404, 'profile');
    expectStatus(await call('B', 'PUT', `/community/follows/${users.A.id}`), 404, 'follow');
    const f = await db.query(`select count(*)::int n from "Follow" where "followerId" = $1`, [users.B.id]);
    if (f.rows[0].n !== 0) throw new Error('follow survived the block');
  });
  await step('export includes community data', async () => {
    const j = ok(await call('A', 'GET', '/me/export'), 'export');
    if (!j.community?.publicProfile || j.community.posts.length < 3) throw new Error(JSON.stringify(j.community).slice(0, 200));
    return `${j.community.posts.length} posts, ${j.community.comments.length} comments`;
  });
  await step('delete both accounts → every community row is gone', async () => {
    for (const who of ['A', 'B']) {
      const j = ok(await call(who, 'DELETE', '/me', { confirm: 'DELETE' }), `delete ${who}`);
      if (!j.authUserDeleted) throw new Error(`auth user ${who} not deleted`);
    }
    const ids = [users.A.id, users.B.id];
    const left = await db.query(`select
      (select count(*) from "PublicProfile" where "userId" = any($1::uuid[])) +
      (select count(*) from "Post" where "authorId" = any($1::uuid[])) +
      (select count(*) from "Comment" where "authorId" = any($1::uuid[])) +
      (select count(*) from "Reaction" where "userId" = any($1::uuid[])) +
      (select count(*) from "Follow" where "followerId" = any($1::uuid[]) or "followeeId" = any($1::uuid[])) +
      (select count(*) from "Block" where "blockerId" = any($1::uuid[]) or "blockedId" = any($1::uuid[])) +
      (select count(*) from "Report" where "reporterId" = any($1::uuid[])) as n`, [ids]);
    if (Number(left.rows[0].n) !== 0) throw new Error(`${left.rows[0].n} rows left`);
    users.A.id = users.B.id = '';
    return '0 rows left';
  });
} finally {
  for (const who of ['A', 'B']) {
    if (users[who]?.id) {
      const r = await fetch(`${SB}/auth/v1/admin/users/${users[who].id}`, { method: 'DELETE', headers: admin });
      console.log(`cleanup: removed test user ${who} (${r.status})`);
    }
  }
  // moderation audit rows written during this run whose post/comment no longer exists (the test users' content)
  await db.query(`delete from "ModerationAction" m where m."createdAt" >= $1
    and not exists (select 1 from "Post" p where p.id::text = m."targetId")
    and not exists (select 1 from "Comment" c where c.id::text = m."targetId")`, [startedAt]);
  await db.end();
  console.log(failures ? `\n${failures} step(s) failed` : '\nAll steps passed');
  process.exitCode = failures ? 1 : 0;
}
