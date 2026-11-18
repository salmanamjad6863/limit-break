# Handoff: continue LIMITBREAK from here

Paste everything below the line into Cursor (Agent mode) at the repo root.

---

You are continuing work on **LIMITBREAK**, an original-IP anime RPG fitness app. Read `PLAN.md`, `SYSTEMS.md` (formulas and rules, the spec), `ARCHITECTURE.md` (§12 sprint table = what's built), `VISUALS.md`, `docs/launch/AUTH.md`, `docs/launch/LAUNCH.md` before changing anything.

## Stack
- pnpm + turbo monorepo:
  - `apps/mobile` (Expo SDK 58, Expo Router, Reanimated 4, Skia, Zustand persisted on AES-256 MMKV, TanStack Query persisted, typed Hono RPC client `api`).
  - `apps/api` (Hono on Node, `tsx`, vitest tests with a fake Prisma in `test/fakeDb.ts`).
  - `packages/engine` (pure TS game math, the source of truth for both app demo mode and server).
  - `packages/contracts` (Zod DTOs), `packages/content` (JSON data), `packages/db` (Prisma 7 + `@prisma/adapter-pg`, SQL migrations in `prisma/migrations/NNNN_name/migration.sql`).
- **Backend:** Supabase (Tokyo). Auth is ES256 JWKS. RLS is on for every table; the API connects as a privileged role and filters by `userId`. The app never touches tables directly.
- **Modes:** `signedIn` means the server is authoritative. `demo` (no Supabase env) runs the same engine on-device.
- **Env files** (never print or commit values): `apps/api/.env`, `apps/mobile/.env`, `packages/db/.env` (`DATABASE_URL` pooler 6543, `DIRECT_URL` 5432).
  - Optional API env: `ANTHROPIC_API_KEY` (community moderation classifier, model `claude-haiku-5-5`), `MODERATOR_IDS`, `COMMUNITY_WORDLIST`.
  - App: `EXPO_PUBLIC_OTP_LENGTH=8` (the Supabase project sends 8-digit codes).

## Done and committed (`main`, local only, never pushed)
- Sprints 0–7 (training, nutrition, progression/trials, quests/streaks, visuals/trainer/aura, hardening).
- **Sprint 8** (`7fe1b74`):
  - Guest-first auth: a Supabase anonymous account on first launch; "Save your progress" = `updateUser({email})` + `verifyOtp` type `email_change` on the same account; sign-in = `signInWithOtp` + `verifyOtp` type `email`.
  - Encrypted storage; strict JWT checks with guests flagged (`requireSavedAccount`).
  - Restore on a new phone (`GET /workouts/state`, migration 0009); re-consent (`POST /me/consent`).
- **Sprint 9** (`ede2728`), community core:
  - Handles, follow/block/report, feed (Following / Global hot / My Rank), posts with workout cards, auto milestone posts, stickers, comments with one reply level.
  - Pre-moderation: wordlist → Claude classifier → moderator queue. Trust levels T0–T3; under-18 protections.
  - Monthly boards (Most Consistent, XP Champions). Migration 0010.
- Migrations **0001–0010 are applied** to the Supabase DB.

## In progress (UNCOMMITTED in the working tree): audit fixes
Three code reviews found about 35 defects. **All three fix groups are finished.** Verified at handoff: API vitest 82/82 + tsc, engine vitest 113/113, mobile tsc, contracts tsc, all green. Still to do: apply migration 0011, run both smoke tests, check in the simulator, commit.

### A. Community: done by hand, needs test and commit
- `follow()` rejects private profiles and adult↔minor follows.
- `report()`:
  - The reporter must be able to see the target.
  - Only established reporters (3+ days, 3+ workouts) count toward the 3-report auto-hold.
  - The hold row is written only when status actually changes.
- Global feed: snapshot cursor `snapshotMs:offset`, `capPerAuthor()` (no dropped posts), and a candidate set of the newest plus the most-engaged posts.
- Following and My Rank tabs: `(createdAt, id)` cursor.
- Race-safe counters:
  - Reactions: `INSERT … ON CONFLICT DO NOTHING`; unreact: `deleteMany` count.
  - Comment delete and moderation: conditional `updateMany`.
- Replies require a visible, unblocked parent; orphan replies are hidden. The duplicate-id paths return 409.
- `viewer()` computes upheld reports with one SQL query.
- Boards: true placement via `RANK() OVER` for hunters outside the top 100.
- New `GET /community/posts/:id`.
- Per-user rate limits: `userRateLimit` in `middleware/rateLimit.ts`, applied in `community/routes.ts`.
- App:
  - `usePost(id)` (deep links work) and `cachedPost`.
  - Optimistic reactions read from the cache, with `cancelQueries` and `onSettled`.
  - The post screen's `canComment` mirrors the server (followers-only, pending posts).

### B. Accounts / session / offline (helper agent FINISHED; its files type-check)
Files: `apps/mobile/src/features/session/*`, `lib/storage.ts`, `lib/query.ts`, `lib/mutation.ts` (new), `app/_layout.tsx`, `app/sign-in.tsx`, `features/account/*`, `features/training/sync.ts`.
Intended fixes:
1. Offline sign-out must still end the local session.
2. A saved account whose session ends unexpectedly goes to the sign-in screen, not a new guest. The same applies after account deletion.
3. The persisted query cache is scoped per user and removed on wipe (`QUERY_CACHE_KEY`).
4. The route guard waits for `useIsRestoring()`.
5. The navigator never unmounts after first show.
6. `onlineManager` is wired, and `resumePausedMutations()` runs after restore. Mutations need `mutationKey` + `setMutationDefaults` to survive a restart (pattern in `sync.ts`).
7. `sync.ts` merges only freshly fetched data, keeps pending local program and pain flags, and doesn't resurrect workouts deleted elsewhere.
8. Guests signing in use `shouldCreateUser: false`.
9. `storage.ts` retries the key read, never overwrites an existing key, and falls back to an in-memory store instead of plain text.

Agent notes (all done except where marked):
- Offline: no NetInfo or expo-network is installed. A failed request marks the app offline, `/health` is polled every 15 s and on app foreground, and coming back online replays paused mutations. `resumePausedMutations()` + `invalidateQueries()` run after cache restore.
- New `LAST_WAS_SAVED_FLAG`. `deleteAccount` sets `SIGNED_OUT_FLAG` and signs out locally. **Still to fix:** `deleteAccount` calls `router.replace('/')`, which is guarded off when signed out; remove it and let the guard route to sign-in.
- Guests signing in get a `'noAccount'` error that shows a "Save your progress" button.
- Persisted query cache is tagged with the owner user (`setQueryCacheOwner`); the provider mounts only once the session is known.
- The `nutrition/local.ts` type errors seen mid-way were resolved by agent C (mobile tsc is clean).

### C. Core systems (helper agent FINISHED; all 13 items fixed)
Files: `apps/api/src/modules/{workouts,progression,quests,nutrition}`, `progression/ap.ts` (new), `lib/db.ts` (new), engine nutrition, mobile `features/{training/history,nutrition/hooks,progression/useAttemptTrial}`, new migration **`0011_integrity` (NOT applied yet)**.
Intended fixes:
1. AP is granted only above the highest level ever reached (no edit-down/edit-up farming).
2. Reject `finishedAt` in the future, before `startedAt`, or older than 7 days.
3. Mutation ids are generated at the call site, not inside `mutationFn` (retries no longer double-grant).
4. Copy meal/day is idempotent via `copyId` and deterministic ids.
5. `finishedAt` is frozen when Finish is tapped.
6. Quest progress for yesterday is accepted until that day is resolved.
7. Cardio entries are stored on the session and reused on edit.
8. Custom food edits update the row.
9. The trial route doesn't post milestones for duplicates; P2002 races return the duplicate result instead of a 500.
10. Low-intake safety rule (SYSTEMS.md §2.8) is wired with a supportive UI card.
11. `lowDayConfirm` ("was this a full day?") is added, and the check-in uses the 800 kcal rule.
12. The water target includes training hours.
13. Demo/server parity: own PRs excluded on edit, AP on level-up, sick-day 7/30 rule, real age.

Agent notes:
- New helpers: `progression/ap.ts` (`apForLevelUp`, uses `HunterState.apGrantedLevel`), `lib/db.ts` (P2002 race handling), mobile `lib/mutation.ts` (`withKeys` stamps ids at `mutate()` time).
- Migration `0011_integrity` adds `HunterState.apGrantedLevel` (backfilled to `level`) and `WorkoutSession.cardio JSONB`. Prisma client is regenerated; **apply it to the DB before running the API against Supabase**, or queries touching these columns will fail.
- Manual logs were already limited to the last 7 days and 300 minutes in the contract (unchanged).
- The low-intake card shows supportive text and a settings button. Add an external support-resources link (per region) before launch.

### Finish the audit (do in this order)
1. `git diff` review of B and C for half-finished edits. Then:
   - `cd apps/api && npx vitest run && npx tsc --noEmit -p .`
   - `cd packages/engine && npx vitest run`
   - `cd apps/mobile && npx tsc --noEmit -p .`
   - `cd packages/contracts && npx tsc --noEmit -p .`
2. Review `packages/db/prisma/migrations/0011_integrity/migration.sql` (must be additive and backfill existing rows). Apply it with `cd packages/db && npx prisma migrate deploy`, then `npx prisma generate`. Note: on this Mac, Node DNS for the Supabase pooler sometimes fails briefly (ENOTFOUND); retry.
3. Start the API (`cd apps/api && npx tsx --env-file=.env src/server.ts`, port 8787). Run both end-to-end tests against the real DB. They create throwaway users and delete them:
   - `node scripts/smoke.mjs`
   - `node scripts/smoke-community.mjs`

   Both must print "All steps passed".
4. Simulator check (Metro already configured):
   - Guest → onboarding → workout → "Save your progress" (8-digit code) → sign out → sign in.
   - Community: pick a handle, post, react, comment, open a post via its screen.
5. Commit with a clear message (no push). Update `ARCHITECTURE.md` §12 and `docs/launch/LAUNCH.md` with what changed.

## Known remaining gaps (from the audit; not yet fixed)
- Mutations other than program and pain flags still lack `mutationKey` + `setMutationDefaults`, so they don't survive an app restart while offline. Apply the pattern in `features/training/sync.ts` to: workout finish/edit/delete/manual, notes, quest progress, nutrition logs, weigh-ins, settings, community writes.
- Quest `dueAt` is hard-coded to UTC 03:00 instead of local rollover.
- Streak-risk and Penalty Zone reminders are only scheduled when the app opens that day.
- Workout reminders use one workout name for every weekday.
- Signed-in nutrition writes aren't optimistic offline (the diary in airplane mode).
- The TDEE prior uses `daysPerWeek × sessionMinutes` instead of the chosen weekdays.
- Rate-limit buckets are in memory (one API instance only). `x-forwarded-for` is trusted for unauthenticated callers. Fix behind Railway's proxy before deploy.
- Community leftovers:
  - "Most Improved" board (needs re-test history).
  - Photo posts plus image moderation.
  - Follow requests for private profiles.
  - Web moderation UI (APIs are ready: `GET /community/moderation`, `POST /community/moderation/:type/:id`, `/progression/reviews`).
- Trial-video retention job; CAPTCHA (Turnstile) for anonymous sign-ins; HealthKit / Health Connect; live USDA search on the server.

## Next in the plan
- **Settings hub (in progress):** `/settings` gear on Home + Profile. Identity (`PUT /me/identity` — name + sigil, class locked), notifications (`PUT /me/notifications` + on-device workout toggle), subscription shell (Free / restore / manage). Account dump moved off Profile. PAYWALL still off. Avatar Forge still parked.
- **Sprint 11 ✅ (depth):** API `/depth/*` + migration **0014_depth**; mobile Progress hub, meal templates, Gym Mode, rest-day lore. Stubs: Live Activity / widgets / HealthKit. **Manual:** private Storage bucket `progress-photos` (8 MB).
- **Avatar Forge — PENDING:** parked until proper VRoid / layered art. Home/Profile stay on `HeroEmblem` only (no `/forge` UI). Scaffold kept: migration **0015_avatar**, `/avatar` API, Essence mint, `docs/AVATAR.md`. Do not ship cosmetics UI until portraits + overlays read as real.
- **Last:** Apple/Google sign-in → Railway deploy + smokes → subscriptions (RevenueCat). Depth polish: real Live Activities, Health write-back, watch logger.

## Rules
- Original IP only.
- Never ranking or public display of body weight, calories or food.
- Keep the server authoritative and every write idempotent (client-generated ids).
- Every new table: RLS enabled with no policies, and an FK cascade from `Profile`.
- Don't print or commit secrets.
- Don't push or deploy unless asked.
- Use the official Anthropic SDK for Claude calls (default model `claude-opus-5-5`; the moderation classifier uses `claude-haiku-5-5` per the spec).
- Run the tests and both smoke scripts before every commit.
