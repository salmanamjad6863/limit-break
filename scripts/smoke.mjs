#!/usr/bin/env node
/**
 * Signed-in smoke test against a real Supabase project + API (local or Railway).
 * Creates a throwaway confirmed user, runs the main journey, then deletes the account
 * (and verifies it is gone). Never prints keys, passwords or tokens.
 *
 *   node scripts/smoke.mjs                         # API at http://localhost:8787
 *   SMOKE_API_URL=https://… node scripts/smoke.mjs  # deployed API
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const envFile = (p) => Object.fromEntries(readFileSync(new URL(p, import.meta.url), 'utf8').split('\n')
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const apiEnv = envFile('../apps/api/.env');
const appEnv = envFile('../apps/mobile/.env');
const SB = apiEnv.SUPABASE_URL.replace(/\/$/, '');
const SECRET = apiEnv.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = appEnv.EXPO_PUBLIC_SUPABASE_KEY;
const API = (process.env.SMOKE_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const admin = SECRET.startsWith('sb_') ? { apikey: SECRET } : { apikey: SECRET, Authorization: `Bearer ${SECRET}` };

const TZ = 'Asia/Karachi';
const gameDate = (d = new Date()) => new Date(d.getTime() - 3 * 3600_000).toLocaleDateString('en-CA', { timeZone: TZ });
const today = gameDate();
let token = '';
let userId = '';
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
async function step(name, fn) {
  try {
    const detail = await fn();
    console.log(`✓ ${name}${detail ? `  ${detail}` : ''}`);
  } catch (e) {
    failures++;
    console.log(`✗ ${name}  ${String(e.message ?? e).slice(0, 400)}`);
  }
}
const expectOk = (r, what) => { if (r.status !== 200) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`); return r.json; };

const email = `smoke+${Date.now()}@limitbreak.test`;
const password = randomBytes(18).toString('base64url');

try {
  await step('create confirmed test user (admin API)', async () => {
    const r = await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) });
    const j = await r.json();
    if (!r.ok) throw new Error(`HTTP ${r.status} ${j.msg ?? j.message ?? JSON.stringify(j)}`);
    userId = j.id;
    return `id ${userId.slice(0, 8)}…`;
  });
  await step('sign in with email + password (publishable key)', async () => {
    const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUBLISHABLE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const j = await r.json();
    if (!r.ok) throw new Error(`HTTP ${r.status} ${j.msg ?? j.error_description ?? JSON.stringify(j)}`);
    token = j.access_token;
    return 'got access token';
  });
  await step('GET /me before onboarding (auth trigger created the profile)', async () => {
    const j = expectOk(await call('GET', '/me'), 'me');
    if (j.onboarded !== false) throw new Error(`expected onboarded=false, got ${j.onboarded}`);
  });
  await step('POST /me/onboarding (with health-data consent)', async () => {
    const j = expectOk(await call('POST', '/me/onboarding', {
      hunterName: 'Smoke', heroId: 'ren', goal: 'cut', experience: 'novice', location: 'HOME', equipment: ['dumbbells'],
      daysPerWeek: 3, sessionMinutes: 45, questTime: '07:00', heroClass: 'HYBRID', sex: 'male', birthDate: '1998-04-10',
      heightCm: 178, weightKg: 80, bodyFatPct: null, lifestyle: 'light', injuries: [], parqAnyYes: false, nutritionMode: 'full',
      fatPreference: 'balanced', timezone: TZ, assessment: { pushups: 22, plankSec: 80, squats60: 40 }, notificationsOptIn: false, consentVersion: '2026-11',
    }), 'onboarding');
    if (!j.onboarded || !j.state) throw new Error('not onboarded');
    return `level ${j.state.level}, rank ${j.state.rank}, ${j.state.xp} XP`;
  });
  await step('GET /me after onboarding (training + nutrition profile)', async () => {
    const j = expectOk(await call('GET', '/me'), 'me');
    if (!j.profile?.weekdays?.length || !j.nutrition?.birthDate) throw new Error('missing profile.weekdays or nutrition');
    return `weekdays ${j.profile.weekdays.join(',')}, goal ${j.nutrition.goal} ${j.nutrition.ratePerWeek * 100}%/wk`;
  });
  await step('PUT /me/training (Mon/Wed/Fri at 18:00)', async () => {
    const j = expectOk(await call('PUT', '/me/training', { experience: 'novice', location: 'HOME', equipment: ['dumbbells'], injuries: [], sessionMinutes: 45, weekdays: [1, 3, 5], workoutTime: '18:00' }), 'training');
    return `weekdays ${j.profile.weekdays.join(',')} at ${j.profile.workoutTime}`;
  });
  await step('GET /quests/today', async () => {
    const j = expectOk(await call('GET', '/quests/today'), 'quests');
    return `daily: ${j.daily.slots.map((s) => `${s.exerciseId}×${s.target}`).join(', ')}`;
  });

  const workoutId = randomUUID();
  const set = (n, reps) => ({ id: randomUUID(), exerciseId: 'push-up', order: n, reps, weightKg: null, rir: 2, rpe: null, durationS: null, distanceM: null, isWarmup: false, setType: 'normal', completedAt: new Date().toISOString() });
  const sets = [set(0, 12), set(1, 11)];
  await step('PUT /workouts/program (pick Foundation)', async () => {
    const j = expectOk(await call('PUT', '/workouts/program', { programId: 'foundation' }), 'program');
    return j.activeProgramId;
  });
  await step('POST /workouts/finish (2 push-up sets)', async () => {
    const j = expectOk(await call('POST', '/workouts/finish', {
      id: workoutId, plannedWorkoutId: null, programId: 'foundation', dayId: 'a', sessionRpe: 7, cardio: [], startedAt: new Date(Date.now() - 1800_000).toISOString(),
      finishedAt: new Date().toISOString(), plannedHardSets: 3, sets, kind: 'program', name: 'Smoke Workout', notes: 'smoke test',
    }), 'finish');
    return `+${j.granted} XP → level ${j.level}`;
  });
  await step('GET /workouts + detail', async () => {
    const list = expectOk(await call('GET', '/workouts'), 'list');
    if (list.workouts.length !== 1) throw new Error(`expected 1 workout, got ${list.workouts.length}`);
    const d = expectOk(await call('GET', `/workouts/${workoutId}`), 'detail');
    return `${d.name}: ${d.sets.length} sets, ${d.xp} XP, notes "${d.notes}"`;
  });
  await step('PATCH /workouts/:id (add a third set → XP diff)', async () => {
    const j = expectOk(await call('PATCH', `/workouts/${workoutId}`, { editId: randomUUID(), sets: [...sets, set(2, 10)], notes: 'edited', sessionRpe: 7 }), 'edit');
    return `workout XP now ${j.xp} (delta ${j.delta >= 0 ? '+' : ''}${j.delta})`;
  });
  await step('POST /workouts/manual (football, unverified)', async () => {
    const j = expectOk(await call('POST', '/workouts/manual', { id: randomUUID(), type: 'sport', name: 'Football', minutes: 45, rpe: 7, localDate: today, distanceKm: null, notes: null }), 'manual');
    return `+${j.granted} XP`;
  });
  await step('PUT /workouts/notes/push-up', async () => {
    expectOk(await call('PUT', '/workouts/notes/push-up', { note: 'Hands under shoulders' }), 'note');
    const j = expectOk(await call('GET', '/workouts/notes'), 'notes');
    if (j.notes['push-up'] !== 'Hands under shoulders') throw new Error('note not saved');
  });
  await step('PUT /workouts/avoid (flag push-up as painful, then clear)', async () => {
    expectOk(await call('PUT', '/workouts/avoid', { exerciseId: 'burpee', avoid: true }), 'avoid on');
    const j = expectOk(await call('PUT', '/workouts/avoid', { exerciseId: 'push-up', avoid: true }), 'avoid on');
    expectOk(await call('PUT', '/workouts/avoid', { exerciseId: 'push-up', avoid: false }), 'avoid off');
    return `flagged: ${j.avoid.join(', ')}`;
  });
  await step('GET /workouts/state (restore on a new phone)', async () => {
    const j = expectOk(await call('GET', '/workouts/state'), 'state');
    if (j.activeProgramId !== 'foundation') throw new Error(`program ${j.activeProgramId}`);
    if (j.completedSessions !== 1) throw new Error(`completedSessions ${j.completedSessions}`);
    if (j.lastSet['push-up']?.reps !== 10) throw new Error(`lastSet ${JSON.stringify(j.lastSet['push-up'])}`);
    if (j.notes['push-up'] !== 'Hands under shoulders') throw new Error('notes missing');
    if (JSON.stringify(j.avoid) !== '["burpee"]') throw new Error(`avoid ${JSON.stringify(j.avoid)}`);
    if (j.recent.length !== 2 || !j.recent.some((w) => w.programId === 'foundation' && w.dayId === 'a')) throw new Error('recent workouts wrong');
    return `program ${j.activeProgramId} day ${j.completedSessions + 1}, ${j.recent.length} recent, last push-up set ${j.lastSet['push-up'].reps} reps`;
  });
  await step('POST /me/consent (current version only)', async () => {
    const bad = await call('POST', '/me/consent', { version: '2000-01' });
    if (bad.status !== 400) throw new Error(`old version accepted: ${bad.status}`);
    const me = expectOk(await call('GET', '/me'), 'me');
    expectOk(await call('POST', '/me/consent', { version: me.consentVersion }), 'consent');
    return `consentVersion ${me.consentVersion}`;
  });
  await step('GET /progression', async () => {
    const j = expectOk(await call('GET', '/progression'), 'progression');
    return `STR ${j.stats.STR}, trial: ${j.trial.reason}`;
  });

  await step('GET /nutrition/day (targets from the real profile)', async () => {
    const j = expectOk(await call('GET', '/nutrition/day'), 'day');
    return `${j.plan.kcal} kcal, ${j.plan.proteinG} g protein, calibrating=${j.plan.calibrating}`;
  });
  await step('GET /nutrition/foods?q=chicken', async () => {
    const j = expectOk(await call('GET', '/nutrition/foods?q=chicken'), 'search');
    return `top: ${j.foods.slice(0, 2).map((f) => f.name).join(' · ')}`;
  });
  await step('POST /nutrition/logs (1 cup rice) + day totals', async () => {
    expectOk(await call('POST', '/nutrition/logs', {
      id: randomUUID(), grams: 186, meal: 'lunch', servingLabel: '1 cup', localDate: today, loggedAt: new Date().toISOString(),
      food: { id: 'rice-white-cooked', name: 'Rice, white, cooked', per100: { kcal: 130, protein: 2.38, carbs: 28.59, fat: 0.21, fiber: 0.3 }, servings: [{ label: '1 cup', grams: 186 }], source: 'usda', verified: true },
    }), 'log');
    const j = expectOk(await call('GET', `/nutrition/day?date=${today}`), 'day');
    return `eaten ${j.totals.kcal} kcal (expect ~242)`;
  });
  await step('GET /nutrition/foods/barcode (Open Food Facts, cached)', async () => {
    const j = expectOk(await call('GET', '/nutrition/foods/barcode/3017620422003'), 'barcode');
    return `${j.name} · ${j.brand} · ${j.per100.kcal} kcal/100 g`;
  });
  await step('POST /nutrition/weigh-ins + summary', async () => {
    expectOk(await call('POST', '/nutrition/weigh-ins', { id: randomUUID(), weightKg: 79.6, localDate: today, measuredAt: new Date().toISOString() }), 'weigh-in');
    const j = expectOk(await call('GET', '/nutrition/summary'), 'summary');
    return `${j.weighIns.length} weigh-in(s), check-in: ${j.checkIn.verdict}`;
  });
  await step('PUT /nutrition/settings (protein override)', async () => {
    const s = expectOk(await call('GET', '/nutrition/summary'), 'summary').settings;
    const j = expectOk(await call('PUT', '/nutrition/settings', { ...s, proteinOverrideG: 170 }), 'settings');
    return `protein now ${j.plan.proteinG} g`;
  });

  await step('GET /me/export', async () => {
    const j = expectOk(await call('GET', '/me/export'), 'export');
    return `${j.workouts.length} workouts, ${j.foodLogs.length} food logs, ${j.body.length} body metrics`;
  });
  await step('DELETE /me (account deletion)', async () => {
    const j = expectOk(await call('DELETE', '/me', { confirm: 'DELETE' }), 'delete');
    if (!j.authUserDeleted) throw new Error('auth user was not deleted (is SUPABASE_SERVICE_ROLE_KEY set on the API?)');
    return 'data + auth user deleted';
  });
  await step('verify the auth user is gone', async () => {
    const r = await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: admin });
    if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
    userId = '';
  });
} finally {
  // cleanup if something failed before the delete step
  if (userId) {
    const r = await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: admin });
    console.log(`cleanup: removed test user (${r.status})`);
  }
  console.log(failures ? `\n${failures} step(s) failed` : '\nAll steps passed');
  process.exitCode = failures ? 1 : 0;
}
