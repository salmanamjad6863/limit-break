# LIMITBREAK — Architecture & Build Blueprint (v2)

> Companion to [PLAN.md](PLAN.md). PLAN.md describes **what** we build (game design, training, nutrition, roadmap). This file describes **how** we build it: stack, repo layout, reusable layers, the animation system, the low-budget asset pipeline and the build order.
> Where the two disagree, this file wins on tech and assets. Workout visuals, follow-along, naming and the Avatar Forge: [VISUALS.md](VISUALS.md). Every formula, the community rules and the subscription setup live in [SYSTEMS.md](SYSTEMS.md).

---

## 1. Locked Decisions

| Area | Decision |
|---|---|
| Mobile | **Expo (latest SDK, currently 58)** + React Native New Architecture + TypeScript strict + **Expo Router** |
| Backend data | **Supabase**: Postgres, Auth, Storage, Realtime, pg_cron |
| ORM / schema | **Prisma**, the single source of truth for the DB schema and migrations, used by the API server |
| API | **Hono** (Node 24) + Prisma + Zod, typed end-to-end with the Hono RPC client. Hosted on Vercel (Fluid Compute) or Railway |
| Server state (app) | **TanStack Query** v5, persisted to MMKV for offline use |
| Client state (app) | **Zustand**, sliced stores, persisted to MMKV |
| Forms / validation | react-hook-form + **Zod** (schemas shared with the API) |
| Animation | **Reanimated 4** + **React Native Skia** + **Rive** + Lottie + Moti (see §5; GSAP is web-only) |
| Monorepo | **pnpm workspaces + Turborepo** |
| Payments / analytics / crashes | RevenueCat · PostHog · Sentry |
| Budget stance | **Low cost.** Free tools, free or cheap licensed assets, pre-generated voice, no paid VAs |

### 1.1 Characters: why we are not shipping Zoro, Naruto or Sung Jin-Woo
Using famous characters (their names, designs, faces or recognisable outfits) in a commercial app is copyright and trademark infringement. The owners are Shueisha/Toei, Kakao/D&C Media and Crunchyroll/Aniplex, and in practice the consequences are:
- **The App Store and Google Play reject or remove the app** (Apple guideline 5.2, Google's IP policy). Owners actively file takedowns against fan apps.
- **The account can be banned and you lose all your users and revenue in one strike.** That is the single biggest risk to the business.
- Official licensing costs far more than we have budget for.

**What we do instead (and it costs less):** six **original "archetype" heroes** that tap the *same fantasies* fans love, like the three-sword swordsman, the ninja who never gives up and the weakest hunter who becomes the strongest, without copying names, faces, hair+outfit combos or signature items. Fans recognise the *vibe*, and we own the IP outright (merch, sequels, no takedowns). See §4.

---

## 2. System Overview

```
┌──────────────────────────── Expo app (iOS / Android) ─────────────────────────────┐
│  Expo Router screens  →  feature hooks  →  TanStack Query  ─┐                      │
│                                          Zustand stores ───┤ MMKV (persist/offline) │
│  @lb/engine (XP, ranks, stats, TDEE) ← instant optimistic UI│                      │
│  Animation layer: Reanimated · Skia · Rive · Lottie · expo-image (animated WebP)    │
└─────────────┬───────────────────────────────┬──────────────────────────────────────┘
              │ supabase-js                    │ Hono RPC client (typed), Supabase JWT
              │ (auth, storage, realtime)      ▼
              │                     ┌──────────────────────────────┐
              │                     │  apps/api  (Hono + Prisma)    │
              │                     │  routes → services → prisma   │
              │                     │  @lb/engine = authoritative   │
              │                     │  cron: quests, pushes, TDEE   │
              │                     └──────────────┬───────────────┘
              ▼                                    ▼  (Supavisor pooler :6543)
┌───────────────────────────────── Supabase ─────────────────────────────────────────┐
│ Postgres (schema owned by Prisma migrations) · Auth · Storage (assets, food photos) │
│ Realtime (guild raids, leagues) · RLS on every table (defense in depth)             │
└─────────────────────────────────────────────────────────────────────────────────────┘
         External: Expo Push · RevenueCat webhooks · Open Food Facts · USDA FDC · Claude API
```

### 2.1 Who talks to what (the rules)
| Operation | Path | Why |
|---|---|---|
| Sign in / sign up / session refresh | App → **supabase-js Auth**: guest (anonymous) first, then email one-time code to save/sign in; Apple/Google later (docs/launch/AUTH.md) | Free, passwordless |
| Every game-affecting write (log workout, complete quest, trial attempt, food log) | App → **API (Prisma)** | Server computes XP: anti-cheat, one place for business rules |
| Reads for screens | App → **API** (default) | Typed, shaped responses, one cache key style |
| Live data (raid HP, league table) | App → **Supabase Realtime** (read-only, RLS) | No websocket server to run |
| File uploads (food photo, avatar export) | App → **Supabase Storage** (signed upload URL issued by the API) | — |
| Schema changes | **Prisma migrate** only | One source of truth; never edit tables in the Supabase dashboard |

### 2.2 Prisma + Supabase specifics
```env
# apps/api/.env
DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```
- `DATABASE_URL` uses the transaction-mode pooler for runtime. `DIRECT_URL` is for `prisma migrate`.
- Prisma connects as a privileged role and **bypasses RLS**. The API therefore verifies the Supabase JWT on every request (`auth` middleware → `ctx.userId`), and every service filters by `userId`. RLS stays on for the Realtime/Storage paths.
- `profiles.id` = `auth.users.id` (UUID). A Postgres trigger (in a Prisma SQL migration) creates the profile row on sign-up.

---

## 3. Monorepo Layout (Built for Reuse)

```
limitbreak/
├─ apps/
│  ├─ mobile/                 # Expo app
│  ├─ api/                    # Hono + Prisma API (Node)
│  └─ web/                    # (later) Next.js landing page + admin; GSAP lives here
├─ packages/
│  ├─ engine/                 # PURE TS game & fitness math: zero deps on React/Prisma
│  ├─ db/                     # Prisma schema, client export, seed scripts
│  ├─ contracts/              # Zod schemas + inferred types shared by app & API
│  ├─ content/                # exercises, programs, quests, ranks, story, voice-line JSON + validators
│  ├─ tokens/                 # design tokens: colors, type scale, spacing, radii, MOTION presets
│  └─ config/                 # tsconfig, eslint, prettier bases
├─ assets-src/                # source files: VRoid .vroid, Blender .blend, Rive .riv, raw audio (Git LFS)
├─ turbo.json  pnpm-workspace.yaml  PLAN.md  ARCHITECTURE.md
```

**Reuse rules**
1. **Game math is written once.** `@lb/engine` runs on the phone (instant feedback) *and* on the server (the result that counts). Results must match. A CI test runs the same fixtures against both.
2. **Every shape is defined once in Zod** (`@lb/contracts`). The API validates with it, the app's forms use it, and TypeScript types are inferred from it.
3. **Content is data, not code.** New quests, exercises, programs, story chapters and voice lines are JSON in `@lb/content`, validated in CI and seeded to the DB. You never need an app release to add a quest (only to add a new *mechanic*).
4. **Design and motion tokens live in one package.** No hex codes or durations inside components.
5. **Features never import from other features.** Shared things go to `src/ui`, `src/lib` or a package.

---

## 4. Characters & Assets: the Low-Budget Pipeline

### 4.1 The roster (6 original heroes, one per class)
| Hero (placeholder name) | Fantasy it taps | Class / training style | Signature look (must stay original) |
|---|---|---|---|
| **Ren Kurogane**, the Shadow Hunter | Weakest-to-strongest, shadow summoner | Hybrid / all-rounder (default hero) | Long dark coat, violet eye-glow, shadow wisps |
| **Tetsu Hayami**, the Ronin | Wandering master swordsman | Fighter (strength) | Sleeveless training gi with taped forearms, a wooden bokken across the back, scar across the knuckles |
| **Kaze**, the Shinobi | Underdog ninja who never quits | Assassin (calisthenics / agility) | Mask scarf, wrapped forearms, wind-swirl motif |
| **Gora**, the Iron Titan | Giant powerhouse | Juggernaut (hypertrophy) | Huge frame, chain-wrapped gauntlets |
| **Aiko Tsubasa**, the Wind Ranger | Fast archer / runner | Ranger (cardio / endurance) | Short cape, wing hair clips, light armour |
| **Master Hoshi**, the Fist Monk | Calm martial-arts master (also **The Guide**) | Monk (mobility / core) | Beads, bare feet, floating star sigils |

- Each hero gets **male/female variants** cheaply (see VRoid below), and the user's avatar can also be built from the same base parts.
- **Originality checklist (before final art):** a different name, a hair colour + hairstyle + outfit combination that doesn't match any famous character, no signature items (no three swords in the mouth, no headband with a leaf symbol, no orange jumpsuit with whisker marks, no identical blue System window).
- **Rank evolution:** each hero has 6 looks (E→S), made from outfit, texture and aura swaps on one model, so they are cheap to produce.

### 4.2 Production pipeline (near-zero cost)
```
VRoid Studio (free, by pixiv)         → design anime 3D characters, export VRM
   ↓
Blender (free) + VRM add-on           → cel-shaded / toon render setup, rank outfits, auras
   ↓
Motion (all free):  Mixamo (common moves, embedded use only)
                    + coach video → Rokoko Vision free plan (gym/skill moves)
                    + hand-keyed in Blender (bench, cables, props)
   ↓
Render transparent frames → encode  → animated WebP (alpha) for character and exercise loops
                                      (the aura is a live Skia layer behind them, not baked in)
                                      MP4 for full-screen cinematics (rank-up)
                                      PNG portraits/busts for UI, story panels
   ↓
apps/mobile/assets  or  Supabase Storage (downloaded on demand, cached)
```
- **One pipeline produces both the characters and the exercise demos.** Exercise videos are the biggest content cost in PLAN.md, and this cuts it to almost nothing: a neutral "trainer" model performs Mixamo motions, all in a consistent anime style.
- Exercises Mixamo doesn't cover come from **coach video → free mocap** or hand-keying in Blender. The full $0 pipeline, licence checks, live aura states, pilot gate and time estimate are in **VISUALS.md §3**. Ready Player Me is **not** an option (shut down in Jan 2026).
- **Optional small spend** (largest impact per dollar): one VGen/Skeb artist to paint the six hero **key-art portraits and the app icon** from your VRoid renders. Everything else stays in the pipeline.
- **AI image tools:** use them only for backgrounds and concepting, never as final hero art (the anime audience pushes back hard on AI-generated art).

### 4.3 Voice, sound and music (no voice-actor budget)
| Need | Free / cheap option | Use |
|---|---|---|
| Japanese anime voices | **VOICEVOX** (free; commercial use allowed with per-character credit, so read each voice's terms) | Hero lines, "LEVEL UP!", rep counting in JP mode |
| English voice | ElevenLabs (low paid tier) or Azure/Google neural TTS | System narrator, Guide lines |
| Fallback / dynamic text | `expo-speech` (device TTS, free) | Rep counts, rest-timer callouts |
| UI and game SFX | Kenney.nl (CC0), Pixabay Sound, freesound (CC0 filter) | Taps, XP ticks, level-up, glitch |
| Music | Pixabay Music / other royalty-free sources | Menus, workout BGM (toggleable) |

- **Pre-generate every voice line at build time** from `@lb/content/voice-lines.json` with a script (`pnpm voice:generate`). That means zero runtime cost, offline playback and consistent quality.
- **Keep an asset ledger:** `assets-src/LICENSES.md` records every asset with its source, license, credit text and date. Credits screen is auto-generated from it. This is non-negotiable for store compliance.

### 4.4 UI art and fonts
- Fonts (Google Fonts, free): **Dela Gothic One** or **Zen Dots** for titles, **Rajdhani** for HUD numbers, **Noto Sans / Noto Sans JP** for body text.
- Icons: Phosphor or Tabler (free), plus custom rank badges built in Rive.
- LottieFiles free animations for small celebrations (check each file's license).

---

## 5. Animation System ("Smooth Modern Anime" Feel)

### 5.1 About GSAP
GSAP works on the DOM and web canvas, so **it does not run in React Native.** We use it only for the `apps/web` landing page. In the app, these are the native-speed equivalents, and they are what top RN apps use:

| Job | Library | Notes |
|---|---|---|
| All UI motion (enter/exit, springs, layout, shared transitions, scroll-linked) | **Reanimated 4** | Runs on the UI thread; v4 adds CSS-style `transition`/`animation` props for simple cases |
| Gestures (swipe a set done, drag, long-press) | **Gesture Handler** | Paired with Reanimated |
| Glow, aura, particles, shaders, glitch, light sweeps, blur | **React Native Skia** | GPU shaders: the "anime power-up" look |
| Interactive vector animation with state machines (rank badge, XP orb, buttons, Guide's face) | **Rive** | Tiny files; state driven by app data |
| Character loops | **expo-image** playing animated WebP | From the VRoid/Mixamo pipeline |
| Simple celebratory loops | **Lottie** | Only where Rive is overkill |
| Declarative micro-animations | **Moti** (on top of Reanimated) | Quick wins for list items, skeletons |
| Feel | `expo-haptics`, `expo-audio` | Every big moment = motion + haptic + sound |

### 5.2 Motion tokens (`@lb/tokens/motion.ts`)
```ts
export const motion = {
  spring: {
    snappy: { damping: 18, stiffness: 260, mass: 0.8 },   // buttons, toggles
    smooth: { damping: 22, stiffness: 160 },              // cards, sheets
    heavy:  { damping: 14, stiffness: 90, mass: 1.4 },    // rank-up, boss entrances
  },
  duration: { instant: 120, fast: 200, base: 320, slow: 600, cinematic: 1400 },
  stagger: { list: 40, hud: 70 },
} as const;
```

### 5.3 Reusable motion primitives (`apps/mobile/src/ui/motion/`)
Each primitive is built once and used everywhere:
| Component | Used for |
|---|---|
| `<PressableScale>` | Every tappable card or button (scale + haptic) |
| `<SystemWindow>` | The signature HUD panel: Skia border glow, scanline, type-in header |
| `<TypewriterText>` / `<GlitchText>` | System messages, onboarding, notifications in-app |
| `<CountUp>` | XP, stats, macros ticking up |
| `<ProgressBar variant="xp" \| "hp" \| "mana" \| "gate">` | XP bar, macro bars, Gate HP |
| `<AuraLayer state rank>` | Skia shader aura behind the trainer/avatar; 7 effort states, colour by rank (VISUALS.md §3.4) |
| `<ParticleBurst>` | PR, quest complete |
| `<HeroSprite hero state>` | Animated WebP character with state (idle/cheer/sad/power-up) |
| `<RiveBadge>` | Rank badges, XP orb |
| `<StaggerList>` | Any list entering |
| `<CinematicOverlay>` | Level-up and rank-up full-screen sequences (queue-driven) |
| `<ScreenTransition>` | Anime "slash" / "flash" route transitions |

**Celebration queue:** a Zustand `useCelebrationStore` queues events (`levelUp`, `rankUp`, `pr`, `questComplete`, `title`) and `<CinematicOverlay>` plays them one at a time. This means multiple rewards never overlap or fight each other.

### 5.4 Smoothness checklist
- Animate only `transform` and `opacity` (and Skia uniforms). Never animate layout on lists.
- **FlashList** for every long list. `expo-image` with caching for every image.
- Zustand **selectors** in every component (`useStore(s => s.x)`), never the whole store.
- Preload the next screen's Rive/WebP assets during the splash or the previous screen.
- **Reduce Motion** setting respected: disables shaders and particles, keeps fades.
- Test on a low-end Android device (e.g. a 4 GB RAM device) every sprint. Target 60 fps, and 120 fps on ProMotion where it's free.

---

## 6. Mobile App Architecture (`apps/mobile`)

```
apps/mobile/
├─ app/                                # Expo Router: thin screens only (compose features)
│  ├─ _layout.tsx                      # providers: Query, Theme, Gesture, Sentry, PostHog, RevenueCat
│  ├─ (auth)/  sign-in.tsx
│  ├─ (onboarding)/ awakening/[step].tsx   # 14-step data-driven flow
│  ├─ (tabs)/_layout.tsx               # NativeTabs: Status · Quests · Gates · Mana · Guild
│  │  ├─ index.tsx                     # STATUS
│  │  ├─ quests/index.tsx  quests/[id].tsx
│  │  ├─ gates/index.tsx   gates/session.tsx (logger)  gates/exercise/[id].tsx  gates/skills.tsx
│  │  ├─ mana/index.tsx    mana/scan.tsx  mana/search.tsx  mana/trends.tsx
│  │  └─ guild/index.tsx   guild/raid.tsx  guild/league.tsx
│  ├─ trial/[rank].tsx  story/[chapter].tsx  paywall.tsx  settings/…
├─ src/
│  ├─ features/                        # one folder per domain, same shape every time
│  │  ├─ progression/   training/   nutrition/   quests/   social/   story/   onboarding/   paywall/
│  │  │   └─ <feature>/
│  │  │       ├─ api.ts          # query/mutation hooks (TanStack) via typed API client
│  │  │       ├─ keys.ts         # query-key factory
│  │  │       ├─ store.ts        # Zustand slice (only if the feature has client state)
│  │  │       ├─ components/     # feature-specific UI
│  │  │       └─ index.ts        # public surface: the only thing screens import
│  ├─ ui/                          # design system: primitives, motion/, layout, typography
│  ├─ lib/                         # api client, supabase client, mmkv, health, notifications,
│  │                               # purchases, analytics, audio, haptics
│  └─ theme/                       # tokens → runtime theme (dark-first, rank accent colours)
├─ assets/  (fonts, bundled hero WebPs for E/D rank, core SFX)
└─ app.config.ts                   # env-driven config (dev / staging / prod)
```

### 6.1 State layering (what goes where)
| Kind of state | Tool | Examples |
|---|---|---|
| Server data | **TanStack Query** | profile, hunter state, quests, program, food diary, raids |
| Long-lived client state | **Zustand + MMKV persist** | session, settings, onboarding draft, **active workout**, celebration queue |
| Ephemeral UI state | `useState` / Reanimated shared values | open sheets, input focus |
| Forms | react-hook-form + Zod from `@lb/contracts` | onboarding, food entry, custom exercise |

### 6.2 Offline-first (without a second ORM on the device)
- **Active workout** lives entirely in `useWorkoutStore` (persisted to MMKV every set), so it survives app kills and has no network dependency. On "Finish Gate" it becomes one `finishWorkout` mutation.
- **Mutations** use a client-generated `id` (UUID) as an **idempotency key**. Paused mutations are persisted and replayed through TanStack Query's `resumePausedMutations` when the device is back online. The API uses upsert-by-id, so retries are safe.
- **Reads** go through the TanStack Query cache, persisted with `createAsyncStoragePersister` over MMKV, so the last-known Status, program and food diary all open instantly offline.
- **Optimistic XP:** the app runs `@lb/engine` locally to show XP immediately. The server's response reconciles it (it is almost always identical).

### 6.3 Typed API client
```ts
// src/lib/api.ts
import { hc } from 'hono/client';
import type { AppType } from '@lb/api';           // type-only import, no server code shipped
export const api = hc<AppType>(env.API_URL, {
  headers: async () => ({ Authorization: `Bearer ${await getAccessToken()}` }),
});

// src/features/training/api.ts
export const useFinishWorkout = () =>
  useMutation({
    mutationKey: trainingKeys.finish(),
    mutationFn: (input: FinishWorkoutInput) =>
      api.workouts.finish.$post({ json: input }).then(r => r.json()),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: progressionKeys.state() });
      celebrations.enqueue(res.rewards);           // level-up / PR / quest overlays
    },
  });
```

---

## 7. API Architecture (`apps/api`)

```
apps/api/src/
├─ index.ts                 # Hono app, exports AppType
├─ middleware/              # auth (verify Supabase JWT), rateLimit, errorHandler, requestId
├─ modules/
│  ├─ profile/      routes.ts  service.ts
│  ├─ progression/  routes.ts  service.ts   # reward calculator (calls @lb/engine)
│  ├─ training/     routes.ts  service.ts   # programs, workouts, PRs, substitutions
│  ├─ quests/       routes.ts  service.ts   # daily generation, completion, penalty
│  ├─ trials/       …
│  ├─ nutrition/    routes.ts  service.ts  providers/ (openFoodFacts.ts, usda.ts, aiPhoto.ts)
│  ├─ social/       …                       # guilds, raids, leagues
│  ├─ notifications/ …                      # push tokens, prefs, Expo push sender
│  └─ webhooks/     revenuecat.ts
├─ jobs/                    # cron: dailyQuestDrop, streakCheck, weeklyBoss, tdeeRecalc, leagueRollover
└─ lib/                     # prisma (from @lb/db), supabaseAdmin, claude, logger
```
- **The pattern in every module:** `routes.ts` (Zod-validated with `@hono/zod-validator` using `@lb/contracts`) → `service.ts` (business logic, transactions, calls `@lb/engine`) → Prisma.
- **The reward flow** is one transaction: insert the event → compute rewards with the engine → write `XpLedger` and update `HunterState` → return `{ hunterState, rewards[] }`.
- **AI calls** (Claude) happen only here: food-photo parsing with structured output validated by Zod, System debrief text and quest flavour text. Responses are cached and capped per user per day to control cost.

---

## 8. Data Model (Prisma, Abbreviated)

> Shorthand: some models are squeezed onto a few lines to save space. Prisma needs **one field per line**, so expand them in the real `schema.prisma`.

```prisma
// packages/db/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Rank      { E D C B A S SOVEREIGN }
enum HeroClass { HYBRID FIGHTER ASSASSIN JUGGERNAUT RANGER MONK }
enum Location  { HOME GYM HYBRID }
enum QuestKind { DAILY MAIN SIDE BOSS TRIAL EVENT HIDDEN PENALTY }
enum QuestStatus { ACTIVE COMPLETED FAILED EXPIRED }

model Profile {
  id          String   @id @db.Uuid               // = auth.users.id
  hunterName  String
  heroId      String                              // which of the 6 heroes / avatar base
  heroClass   HeroClass
  sex         String?
  birthDate   DateTime?
  heightCm    Float?
  goal        String
  experience  String
  location    Location
  equipment   String[]
  timezone    String
  createdAt   DateTime @default(now())
  state       HunterState?
  workouts    WorkoutSession[]
  foodLogs    FoodLog[]
  events      Event[]
}

model HunterState {
  userId     String  @id @db.Uuid
  level      Int     @default(1)
  xp         Int     @default(0)
  rank       Rank    @default(E)
  apUnspent  Int     @default(0)
  streak     Int     @default(0)
  shields    Int     @default(2)
  str Int @default(10) agi Int @default(10) end Int @default(10) vit Int @default(10) spi Int @default(10)
  updatedAt  DateTime @updatedAt
  profile    Profile @relation(fields: [userId], references: [id])
}

model Event {                                    // append-only source of truth
  id        String   @id @db.Uuid                // client-generated = idempotency key
  userId    String   @db.Uuid
  type      String                               // workout.finished, quest.completed, food.logged…
  payload   Json
  clientTs  DateTime
  serverTs  DateTime @default(now())
  flagged   Boolean  @default(false)
  xp        XpLedger[]
  profile   Profile  @relation(fields: [userId], references: [id])
  @@index([userId, type, serverTs])
}

model XpLedger { id Int @id @default(autoincrement()); eventId String @db.Uuid; amount Int; reason String
                 event Event @relation(fields: [eventId], references: [id]) }

model Exercise {
  id String @id                                   // slug from @lb/content
  name String  pattern String  equipment String[]  primary String[]  secondary String[]
  difficulty Int  mediaKey String                 // → animated WebP in Storage
  substitutes ExerciseLink[] @relation("from")
  linkedFrom  ExerciseLink[] @relation("to")
}
model ExerciseLink { fromId String; toId String; kind String  // SUBSTITUTE | PROGRESSION | REGRESSION
  from Exercise @relation("from", fields: [fromId], references: [id])
  to   Exercise @relation("to",   fields: [toId],   references: [id])
  @@id([fromId, toId, kind]) }

model WorkoutSession { id String @id @db.Uuid; userId String @db.Uuid; plannedId String?; startedAt DateTime
  finishedAt DateTime?; sets WorkoutSet[]; profile Profile @relation(fields: [userId], references: [id]) }
model WorkoutSet { id String @id @db.Uuid; sessionId String @db.Uuid; exerciseId String; order Int
  reps Int?; weightKg Float?; rir Int?; durationS Int?; distanceM Float?; isWarmup Boolean @default(false)
  session WorkoutSession @relation(fields: [sessionId], references: [id]) }

model QuestInstance { id String @id @db.Uuid; userId String @db.Uuid; templateId String; kind QuestKind
  targets Json; progress Json; status QuestStatus; dueAt DateTime; completedAt DateTime?
  @@index([userId, status, dueAt]) }

model Food { id String @id; source String; sourceId String?; name String; brand String?; barcode String? @unique
  kcal100 Float; p100 Float; c100 Float; f100 Float; verified Boolean @default(false) }
model FoodLog { id String @id @db.Uuid; userId String @db.Uuid; foodId String; grams Float; meal String; loggedAt DateTime
  profile Profile @relation(fields: [userId], references: [id]) }
model BodyMetric { id String @id @db.Uuid; userId String @db.Uuid; date DateTime; weightKg Float?; source String }
model TdeeEstimate { userId String @db.Uuid; date DateTime; trendKg Float; tdee Float; confidence Float
  @@id([userId, date]) }

// + PersonalRecord, ProgramInstance, PlannedWorkout, TrialAttempt, SkillUnlock, Achievement, Title,
//   Guild, GuildMember, Raid, RaidContribution, League, LeagueMember, PushToken, NotificationPref
```

---

## 9. Shared Engine (`@lb/engine`)

A pure, deterministic, 100%-unit-tested package. It has no I/O; inputs and outputs are plain objects.

```
packages/engine/src/
├─ progression/  xp.ts  levels.ts  ranks.ts  stats.ts  streaks.ts  rewards.ts
├─ training/     e1rm.ts  progression.ts  volume.ts  deload.ts  substitutions.ts  generator.ts
├─ quests/       scaling.ts  dailyGenerator.ts  penalty.ts  shadowSelf.ts
├─ nutrition/    bmr.ts  trend.ts  tdee.ts  targets.ts  safety.ts
└─ index.ts
```
Example contract:
```ts
export function computeRewards(input: {
  state: HunterState; event: GameEvent; history: RecentHistory; now: Date;
}): { xp: number; newState: HunterState; rewards: Reward[] }  // Reward = levelUp | pr | questComplete | title…
```
A tuning script (`pnpm engine:simulate`) simulates 1,000 synthetic users over 365 days to check level pacing against the targets in PLAN.md §4.2.

---

## 10. Notifications Architecture

| Kind | Mechanism | Owner |
|---|---|---|
| Daily Quest drop, streak-at-risk, rest reminders, protein nudge | **Local** (`expo-notifications`), rescheduled whenever app state changes | `src/lib/notifications/scheduler.ts` |
| Rank Trial unlocked, raid events, weekly debrief, win-back | **Remote**: API job → Expo Push API | `apps/api/jobs` |
| Rest timer | Live Activity (iOS) / ongoing notification (Android) — call sites in workout session; native bridge stubbed in `src/features/depth/liveActivity.ts` until `expo-widgets` rebuild | `src/features/depth` + session player |

- Copy lives in `@lb/content/notifications.json` (System voice, localized, `{name}` / `{rank}` templates).
- Every notification carries a deep link (`limitbreak://gates/session`) and goes through Expo Router.
- Caps and quiet hours are enforced on both sides (scheduler and API).

---

## 11. Environments, Tooling & Quality

| Concern | Setup |
|---|---|
| Environments | `dev` / `staging` / `prod`: separate Supabase projects, EAS profiles and update channels |
| Builds | EAS Build (dev client for daily work), EAS Submit, **EAS Update** for JS-only fixes |
| CI | GitHub Actions + Turborepo cache: typecheck, lint, unit tests (engine, contracts, content validation), Prisma migrate diff check. EAS preview build on each PR |
| Tests | Vitest for packages and API, Jest + RNTL for app components, **Maestro** for E2E (onboarding, log a workout, log food, level up) |
| Code quality | ESLint + Prettier, `strict` TS, import boundaries enforced (features can't import other features) |
| Secrets | EAS env vars (app), Vercel/Railway env (API). Never put the Supabase service key in the app |
| Monitoring | Sentry (app + API), PostHog (funnels: onboarding → first workout → day 7) |

---

## 12. Build Order (2-Week Sprints, MVP ≈ 12 Weeks)

| Sprint | Deliverable | Reused foundations created |
|---|---|---|
| **0** (week 0–1) | Monorepo, Expo app shell, API shell, Prisma schema v1 → Supabase, auth, CI, EAS dev builds. **VRoid: first hero + trainer model**; pipeline proven with 1 Mixamo exercise | packages: tokens, contracts, db, engine skeleton |
| **1** | Design system + **motion primitives** (§5.3), theme, Status screen with mock data, `HeroSprite`, `SystemWindow` | All of `src/ui` |
| **2** | Awakening onboarding (14 steps, data-driven), profile creation, Awakening Assessment, notifications primer | Form + Zod patterns |
| **3** | **Real-trainer training system** (detailed below): program templates, workout generator, session player and logger, on-demand sessions, exercise detail | Offline mutation pattern, content-driven programs |
| **4** ✅ | Progression made real: True Stats from data (lifts, calisthenics levels, tests, volume, adherence, decay), **Rank Trials pulled forward** (home/gym variants, server-scored, 7-day cooldown, rank-up cinematic), Hunter Profile (rank ladder, stat breakdown, XP history, PRs, trial history), `GET /progression`, `POST /progression/trials` | Stats recompute after every workout and trial |
| **5** ✅ | Quests: Daily Quest generated from tests (injury swaps, training-day factor, 12-min time box, Rest Ritual), streak resolver (shields, Penalty Zone, Sick Mode, milestones, quest-scale tuning), side quests (manual + auto-verified), Shadow-Self boss (+150 XP claim), `/quests/*` API, local reminders (daily drop, 21:00 streak-at-risk, Penalty Zone) | One `grantXp` path for all non-workout XP |
| **5.5** ✅ | **Training completeness** (SYSTEMS.md §3.10–3.12) — built (engine schedule rules, `PUT /me/training`, `/workouts` list/detail/edit/delete/manual/notes, migration 0007; HealthKit still open): user-picked weekdays + preferred time + reminders, Training settings screen (edit everything), missed-workout shift and rest-day flow, workout history + detail, edit/delete within 7 days with XP diff, manual log (unverified), session and exercise notes, supersets in the player, 5 new programs (PPL, U/L/F, Powerbuilding, Lower & Glutes, Dumbbell Only) | Schedule model, edit-with-diff event pattern |
| **6** ✅ | **Real nutrition** (SYSTEMS.md §2) — built: engine plan/TDEE replay/check-in/search; 53 USDA foods (all 53 verified against USDA FoodData Central, with fdcId) + 9 recipe dishes computed from them; OFF barcode; diary, portions, quick add, custom foods, copy, water, weigh-ins + trend, settings; API `/nutrition/*` + migration 0006. Not yet: HealthKit / Health Connect, live USDA text search on the server (key is in place). Spec: USDA + Open Food Facts + curated regional foods, barcode, diary with meals/quick add/copy, recipes and custom foods, weigh-ins → trend → adaptive TDEE, weekly check-in, nutrition settings, water, offline sync, HealthKit / Health Connect | Provider adapter pattern, food cache |
| **V1–V2** (before launch) ✅ engineering done; clips pending | **Visuals:** muscle map, media manifest + `ExerciseMedia` fallback chain, follow-along player (timed + rep-based), voice cues with captions, guided warm-up/cool-down; Tier-1 demo clips (~40) produced in parallel (VISUALS.md §9) | Media pipeline, follow-along player |
| **V2.5** (before launch) ✅ engineering; pilot clips pending | **Trainer + aura:** `<AuraLayer>` Skia shader (7 effort states), bundled Tier-1 clips, batch render scripts; 5-exercise pilot gate, then Tier-1 production (VISUALS.md §3) | Media pipeline |
| **7** (hardening) ✅ code; store steps in docs/launch | Rank Trial verification (video/HR for A–S), feature-gate layer (`useFeature` / `requireFeature`, kept **open**), analytics, Sentry, perf pass on a low-end Android device, store assets → **soft launch (free)** | Feature matrix (SYSTEMS.md §7.1) |
| **8** ✅ | **Accounts:** guest-first + email one-time code (save progress on the same account, sign in on a new phone), AES-256 encrypted on-device storage (key in Keychain/Keystore), strict JWT checks, restore on a new phone (`GET /workouts/state`), re-consent (`POST /me/consent`) — docs/launch/AUTH.md | Session listener, data wipe on account switch |
| **9** ✅ | **Community core** (SYSTEMS.md §5.1–5.5): handles + public profiles, follow, feed (Following / Global hot / My Rank), progress posts with workout cards, auto milestone posts (PR, rank-up, level ×5, streak 30/100/365), 6 reaction stickers, comments with one level of replies, report / block, pre-moderation (wordlist → Claude Haiku 5.5 classifier, held items in a moderator queue), trust levels T0–T3, under-18 protections, monthly boards (Most Consistent, XP Champions; Most Improved after re-tests), migration 0010. Not yet: photo posts, DMs, guilds, friend streaks, duels, leagues, web moderation UI | `requireSavedAccount`, moderation pipeline |
| **9.5** ✅ audit | **Integrity + session hardening** (post–Sprint 9 review): AP only above `apGrantedLevel` (no edit-farming), `finishedAt` bounds, client-stamped mutation ids, idempotent meal copy, cardio frozen on finish, low-intake / low-day confirm rails, offline sign-out + expired-saved → sign-in (not guest), per-user query cache, community privacy/paging/race-safe counters + `GET /community/posts/:id` + per-user rate limits. Migration **0011_integrity**. Remaining gaps listed in `docs/HANDOFF.md`. | `ap.ts`, `lib/mutation.ts`, `userRateLimit` |
| **10** ✅ | **Friends / guilds / sharing** (SYSTEMS.md §5.6): Friend Streaks + shield gift, Duels, Guilds (≤20), weekly Raid, leagues with lazy week-end settle + promote/demote into next tier, DMs with unread markers, follow requests, Hunter License, photo posts (signed `community-media` upload; T2+ stub image gate until vision provider), guild chat UI + Realtime RLS on `GuildMessage`, in-app moderation queue. Migrations **0012_social** + **0013_social_polish**. Manual: create private Storage bucket `community-media`; confirm Realtime publication. Remaining: true vision moderation, dedicated `apps/web` admin, DM media | `social` module, `/community/media/sign` |
| **11** ✅ | **Depth** (SYSTEMS.md §6): private progress photos + Awakening frame (`progress-photos` bucket), body measurements, Gym Mode (keep-awake + large set controls), meal templates (idempotent apply), AI/template weekly debrief (`/depth/*`), rest-day lore on Home, smart swap (already in session). Stubs: Live Activity / widgets / HealthKit–Health Connect (need dedicated EAS rebuild). Migration **0014_depth**. Manual: create private Storage bucket `progress-photos` (8 MB). Not yet: watch logger, real Live Activities, Health write-back | `depth` module, `src/features/depth`, `src/app/progress/*` |
| **V3–V5** (in progress) | Signature Gates (pending); **Settings hub** (Home/Profile gear → `/settings`; `PUT /me/identity`, `PUT /me/notifications`; subscription shell, PAYWALL off); **Avatar Forge PENDING** (scaffold only — no shipped Forge UI); Tier-2 clips + weekly muscle-volume map pending | Cosmetics + layered avatar renderer |

| **S** (after the full app: post-MVP phases + community) | Subscriptions: store products, RevenueCat, paywall, webhook → Entitlement, Founder transition (SYSTEMS.md §7.3–7.7) | — |

### Sprint 5.5 in detail: Train like a real gym (1–1.5 weeks)
| # | Deliverable | Done when |
|---|---|---|
| 1 | `Schedule` model (contracts + Prisma `TrainingSchedule`) and a migration from `daysPerWeek` | Existing users get weekdays derived from their current template, nothing lost |
| 2 | **Training settings** screen: program, weekdays, time, session length, location/equipment, injuries, goal, plates/bar, warm-up/cool-down defaults, voice | Every onboarding answer is editable; changes apply from the next game day |
| 3 | Rotation pointer + **missed-workout shift**, rest-day card, "Train today instead", "Train anyway" (recovery/Zone 2) | Engine tests for the 48 h rule and the 2-make-ups cap |
| 4 | Workout reminders at preferred time − 30 min, training days only | Rescheduled whenever the schedule changes |
| 5 | **History**: calendar + list + workout detail; per-exercise e1RM chart | Every finished session is visible with all its sets |
| 6 | **Edit / delete within 7 days**, server XP/PR/stat recompute as a diff; manual log (unverified) | API tests: edit up and down, delete, locked after 7 days, manual log excluded from boards |
| 7 | Notes (session + sticky exercise notes), set types (drop, failure), supersets shown as A1/A2 with shared rest | Logged and shown next time |
| 8 | 5 new programs as content JSON + content tests | All slots resolve for every location/equipment combination they claim |

### Sprint 6 in detail: Real nutrition (2 weeks)
| # | Deliverable | Done when |
|---|---|---|
| 1 | Food model + cache (Prisma `Food`, `FoodLog`, `Recipe`, `WeighIn`), USDA + OFF adapters, curated food pack | Search returns USDA, OFF, curated and personal results ranked by §2.7 |
| 2 | Diary UI: meals, add by search / barcode / recent / quick add, portion picker with live macros, copy meal/day | Repeat foods take ≤ 3 taps |
| 3 | Targets from the real profile (birth date, sex, height, weight, activity, goal, rate) replacing demo data | Matches the §2.6 fixture exactly |
| 4 | Weigh-ins → EWMA trend → nightly adaptive TDEE → weekly check-in | Engine tests for convergence and the ±150 kcal smoothing |
| 5 | Nutrition settings (goal/rate, macro preference, manual override, protein-only, hide calories, check-in day), water | Safety rails (§2.4, §2.8) cannot be bypassed |
| 6 | Offline diary + sync, HealthKit / Health Connect (weight + steps in, workouts out) | Works in airplane mode; no duplicate logs after sync |

### Sprint 3 in detail: Train like a real coach (2 weeks)
| # | Deliverable | Notes |
|---|---|---|
| 1 | **Exercise library to ~120** (MVP slice of 250) with pattern, equipment, muscles, cues, mistakes, substitutes and progression chains | Starts from free-exercise-db data, restyled; coach review later |
| 2 | **Program templates as JSON** for 6 of the 14 programs (Foundation, Shinobi Path, Burn Protocol, Iron Foundation, Linear Strength, Upper/Lower Builder) | `@lb/content/programs/*`, validated by Zod |
| 3 | **Engine: workout generator** that fills slots by pattern, equipment and injuries, applies prescription (SYSTEMS §3.8), session time-squeeze (§3.6) and today selection (§3.9) | Pure TS, fixture tests |
| 4 | **Engine: set suggestions**: load from e1RM + target RIR, warm-up ramp, plate math, auto-adjust after each logged set | Reuses §3.1–3.3 |
| 5 | **Program picker** (recommended from onboarding) + **This week** calendar + **Start today's workout** | Train tab |
| 6 | **Session player / logger**: warm-up → main → accessories → finisher → cool-down; one-tap set logging with previous values pre-filled, RIR picker, rest timer with next-up, swap and pain flag, PR detection | `useWorkoutStore` persisted to MMKV, works offline |
| 7 | **Debrief**: session RPE, volume, PRs, XP (engine `sessionXp`), and what changes next time → celebration queue | API `POST /workouts/finish` (idempotent) |
| 8 | **On-demand sessions**: 7-min Express, 15-min HIIT, 10-min Mobility, 12-min Core | Interval timer for HIIT/EMOM |
| 9 | **Exercise detail**: cues, mistakes, muscles, substitutes, history and best e1RM | Placeholder demo media until the VRoid/Mixamo pipeline lands |

Done means a user can pick a program, open today's workout, follow it start to finish offline, see sensible weights and rest, and get XP, PRs and a level-up from real training.

**Status (Sprint 3 shipped):** 87 exercises with cues and mistakes · 6 programs + 4 quick sessions · engine generator (equipment, injuries, difficulty ceiling, fallbacks, time-squeeze, readiness), set coaching (load from e1RM, auto-adjust), shared `computeWorkoutRewards` · `POST /workouts/finish` (idempotent, plausibility-checked) · app: program picker, preview with readiness, session player (timers, rest, swap, pain flag, offline-persisted), debrief, interval player, exercise library and detail. Integration tests generate every program day for home (no equipment), home (DB/bands/bar) and gym users. Deferred: Live Activity rest timer and exercise demo media.

After the MVP (from PLAN.md phases 2–3): adaptive TDEE + AI photo logging → Shadow-Self boss + skill tree + leagues → guilds/raids (Realtime) → seasons + story chapters → widgets and watch app. **Global community (The Hall)** ships in two steps: (1) follows, public profiles, milestone auto-posts, reactions, monthly boards; (2) progress posts with photos, comments, DMs, Hall of Hunters, after moderation tooling and trust levels are live (SYSTEMS.md §5).

---

## 13. Running Costs (Low-Budget Estimate, Early Stage)

Figures are approximate and need checking on each vendor's pricing page before you commit.

| Item | Cost |
|---|---|
| Apple Developer / Google Play | $99 per year / $25 one-time |
| Supabase | Free tier while building → Pro (~$25/mo) at launch |
| API hosting (Vercel / Railway) | Free → ~$5–20/mo |
| EAS | Free tier (queued builds) → paid plan only when needed |
| RevenueCat, PostHog, Sentry | Free tiers cover early stage |
| VRoid, Blender, Mixamo, VOICEVOX, Kenney, free-exercise-db, Google Fonts | Free (follow each license and credit rules) |
| ElevenLabs (English voice lines, pre-generated once) | Low monthly tier, 1–2 months only |
| Claude API (food photos, debriefs) | Usage-based; cap per user per day; premium-only features |
| Optional: hero key-art portraits + app icon | One small commission |

---

## 14. Definition of Done (Every Feature)
- [ ] Shapes defined in `@lb/contracts`; content (if any) in `@lb/content` with validation
- [ ] Game math in `@lb/engine` with unit tests; server is authoritative
- [ ] Works offline (or degrades gracefully, with a clear message)
- [ ] Uses `src/ui` primitives and motion tokens; no one-off animation code
- [ ] Reduce-motion and dynamic-type checked; 60 fps on the low-end test device
- [ ] Analytics events added; errors reach Sentry
- [ ] New assets logged in `assets-src/LICENSES.md`
- [ ] Maestro flow updated if it touches a core path
