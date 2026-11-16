# LIMITBREAK

Anime RPG fitness app: real training, real macros, and a rank you can't fake.

| Doc | What it covers |
|---|---|
| [PLAN.md](PLAN.md) | Product and game design, market, roadmap |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, repo layout, animation system, asset pipeline, sprints |
| [SYSTEMS.md](SYSTEMS.md) | Every formula (nutrition, training, XP, ranks), community, subscriptions |

## Repo

```
apps/mobile      Expo SDK 58 app (Expo Router, TanStack Query, Zustand + MMKV)
apps/api         Hono API on Node (Prisma, Supabase JWT auth, feature gates)
packages/engine  Pure-TS game & fitness math, shared by app and API (tested against SYSTEMS.md)
packages/contracts  Zod schemas + types shared by app and API
packages/content Exercises, heroes, notifications, feature matrix (validated JSON)
packages/tokens  Design + motion tokens
packages/db      Prisma 7 schema, migrations (incl. Supabase trigger + RLS), seed
```

## First-time setup

1. `pnpm install`
2. Create a Supabase project, then:
   - Authentication → Providers → enable **Anonymous sign-ins** (guest-first onboarding).
   - Copy `packages/db/.env.example` → `packages/db/.env` and fill both connection strings.
   - Copy `apps/api/.env.example` → `apps/api/.env`.
   - Copy `apps/mobile/.env.example` → `apps/mobile/.env` (Supabase URL + publishable key, API URL).
3. `pnpm --filter @lb/db exec prisma migrate deploy`: creates tables, the sign-up trigger and RLS.
4. `pnpm --filter @lb/db seed`: loads the exercise catalogue.
5. Run:
   - `pnpm api:dev` → http://localhost:8787/health
   - `pnpm mobile` → press `w` for web, or use a dev build (MMKV needs one on device; Expo Go won't work).

Without the Supabase keys, the app runs in **demo mode** with a sample hunter, which is handy for UI work.

**Web preview note:** React Native Skia needs CanvasKit loaded before any app code runs, so `apps/mobile/index.web.js` loads it first and then starts the router (`index.js` is the native entry). `public/canvaskit.wasm` is copied automatically on install (`pnpm --filter @lb/mobile skia:web`).

## Run on the iOS Simulator

Always run native builds from the repo root script (or from `apps/mobile`), **never** `npx expo run:ios` in the repo root:

```bash
LANG=en_US.UTF-8 pnpm ios
```

- The first build compiles native code (~5–15 min); later JS changes hot-reload.
- `LANG=en_US.UTF-8` avoids a CocoaPods crash in shells without a UTF-8 locale.
- Expo Go will not work (Skia, MMKV and notifications need the dev build).
- Demo mode starts at the Awakening onboarding; "Replay Awakening (demo)" on Status restarts it.

## Everyday commands

| Command | Does |
|---|---|
| `pnpm typecheck` | Typechecks every package |
| `pnpm test` | Engine, content and API tests |
| `pnpm db:migrate` | Creates a migration after editing `schema.prisma` |
| `pnpm --filter @lb/engine simulate` | Prints the XP/level pacing table |
| `cd apps/mobile && npx eas-cli@latest build --profile development` | Dev-client build |

## UI kit (`apps/mobile/src/ui`)

| Layer | Components |
|---|---|
| base | `Text` (Inter variants), `Card`, `SectionHeader`, `Pill`, `Icon` (Ionicons), `Screen` (large title) |
| `motion/` | `PressableScale`, `Appear` (focus-driven stagger), `CountUp`, `TypewriterText`, `GlitchText` (brand moments only) |
| `hud/` | `Button` (primary/secondary/ghost), `Bar`, `StatRow`, `SystemWindow` (System messages only) |
| `form/` | `OptionCard`, `Chips`, `Segmented`, `Stepper`, `TextField`, `TestTimer` |
| `fx/` (Skia) | `ScreenBackground`, `HeroEmblem`, `RankBadge`, `Ring`, `ParticleBurst` |

Design rules: [PLAN.md §18](PLAN.md). Professional first, anime second.
| `features/celebrations` | `useCelebrations` queue + `CinematicOverlay` (level-up, rank-up, PR, title) |

All motion respects the system Reduce Motion setting. Durations and springs come from `@lb/tokens` `motion`.

## Training system (Sprint 3)

| Piece | Where |
|---|---|
| Exercise library (source table) | `packages/content/scripts/build-exercises.py` → `src/data/exercises.json` (run the script after editing) |
| Programs / quick sessions | `packages/content/src/data/programs/*.json`, `quick-sessions.json` |
| Generator, schedule, set coaching | `packages/engine/src/training/generator.ts` |
| Workout rewards (XP, PRs, level) | `packages/engine/src/progression/workout.ts`, shared by the app and `POST /workouts/finish` |
| App flow | `apps/mobile/src/app/workout/*` (preview → session → debrief, `quick/[id]`), `programs.tsx`, `exercises.tsx`, `exercise/[id].tsx` |

## Rules

- Game math only in `packages/engine`; the server result is authoritative.
- Shapes only in `packages/contracts`; content only in `packages/content`.
- Schema changes only through Prisma migrations, never in the Supabase dashboard.
- Premium checks only via `useFeature()` / `requireFeature()`. `PAYWALL_ENABLED=false` until subscriptions launch.
