# LIMITBREAK — Anime RPG Fitness App: Product & Technical Plan

> **v2 update:** the stack (Supabase + Prisma + Hono + TanStack Query + Zustand), the low-budget character/voice pipeline, the animation system and the build order now live in [ARCHITECTURE.md](ARCHITECTURE.md). Where §8–§9 and §14 below differ, ARCHITECTURE.md wins. **All formulas, community rules and the subscription setup** are final in [SYSTEMS.md](SYSTEMS.md), which wins over §4, §6 and §12 below.
>
> **v3 update (design + training):** the app is **a professional fitness app first, anime RPG second**. See §18 Design Principles and the expanded real-trainer training system in §5.6–5.9. Tab names are now plain: Home · Train · Quests · Nutrition · Community. The community is **global** (monthly Top Hunters boards, a public progress feed, comments) as well as friends and guilds; see [SYSTEMS.md §5](SYSTEMS.md).
>
> Working title only. Run a trademark check before you lock the name. Every name, character and term in this doc is a placeholder for **original IP**.

---

## 0. TL;DR

An anime-styled RPG fitness app for iOS and Android, built with Expo / React Native. You "awaken" as a Hunter. Real workouts at home or in the gym clear **Gates** (sessions). Daily Quests build the habit. Your **Rank (E → S)** can only go up by passing **real fitness tests**, and your nutrition is tracked with macro tracking on par with MacroFactor.

**The wedge:** today's Solo-Leveling-style apps are small, buggy, generic and legally risky. The serious fitness apps (Hevy, MacroFactor) have no fantasy layer. We combine **real training science + real nutrition + an original anime world + rank you cannot fake.**

**Tagline idea:** *"Your rank means something."*

---

## 1. Market Read: What Exists and Where the Gap Is

### 1.1 Solo Leveling clones (direct competitors)
Examples: Solo Level: System, Solo Level Arise: Workout, Solo Leveling System (launched Jan 2026, AI quests), Solo Grinding, Solo X Player, Solo Hunter, Arise AI, Ascension System (weekly boss), AniGains, PRLeveling, Level-Up: Fitness, FitVerso (anime/cyberpunk + dragon companion).

What they all do: daily quests → XP → E-to-S rank, a blue "System" window, streaks, sometimes AI quests.

Their weaknesses (this is our opportunity):
| Weakness | Evidence / pattern | Our answer |
|---|---|---|
| **IP risk.** They use "Solo Leveling", "Arise", "Shadow Monarch" | Most say "not affiliated". One takedown wave could wipe them out | 100% original world, characters and terms |
| **Small and low quality.** Installs are mostly in the dozens to low thousands; reviews mention bugs | Store listings | Production-grade build, offline-first, polished animation |
| **Fake progression.** You tap "done" on 100 push-ups and get XP | Core loop in most clones | Rank Trials, plausibility checks, stats computed from real performance |
| **Generic workouts.** The same "100 push-ups / 100 sit-ups / 10 km" for everyone | Anime meme routine | Real periodized programs with home/gym/hybrid and 4 experience tiers |
| **Punishing penalties.** A daily reset that works "right up to the first sick day" (FitCraft guide) | Reviews / guides | Humane Penalty Zone, Recovery Arc, Sick Mode |
| **No real nutrition** | None have adaptive macros | MacroFactor-style adaptive TDEE + barcode + AI photo logging |
| **Static art** | Mostly static UI and stock icons | Rive-animated characters, an avatar that evolves visually with rank |

### 1.2 Adjacent apps to learn from
| App | Steal this | Avoid this |
|---|---|---|
| **MacroFactor** | Adaptive expenditure algorithm, curated food DB, fast logging, "coach" check-ins that are never judgmental | Dry UI |
| **Cronometer / MyFitnessPal** | Barcode scan, huge DB (MFP), micronutrients (Cronometer) | MFP's dirty user-submitted data, static targets |
| **Hevy / Strong** | Fastest set-logging UX, previous-session values pre-filled, rest timer, Live Activity | No motivation layer |
| **Duolingo** | Streak + streak freeze, weekly leagues, notification copy with a character voice, "streak repair" | Guilt-trip notifications |
| **Finch** | Companion that grows with self-care, gentle tone | Too soft for this audience |
| **Habitica** | RPG party / quests for habits | 2013-era UX |
| **Zombies, Run!** | Narrative audio missions that make cardio a story | — |
| **Gacha games (Genshin, Solo Leveling: Arise game)** | Character presentation, level-up "moments", banners, seasonal events | Pay-to-win, predatory gacha (an app-store and ethics risk in a health app) |

### 1.3 Who the user is
- **Core:** ages 16–30, male-skewing but not exclusively, watches anime/manhwa (Solo Leveling, One Punch Man, Jujutsu Kaisen, Baki, Hajime no Ippo, Kengan), plays gacha or RPGs. Often a beginner to early intermediate, and often doing home workouts first.
- **Motivation:** the "glow-up arc" and the "training montage" fantasy. They want to *become* the protagonist.
- **Key markets:** US, Brazil, Mexico, Philippines, Indonesia, India, France, Japan and Korea. Localize to EN, PT-BR, ES and FR first, then JA and KO.
- **Implication:** the free tier must be strong (price-sensitive markets), use regional pricing, and the app must work fully offline with a small download.

---

## 2. The Big Ideas (Our Unique Parts)

1. **Rank Trials: a rank you can't fake.** Level comes from XP (effort). **Rank** (E/D/C/B/A/S) needs both a level threshold *and* passing a real fitness test, scored against age- and sex-adjusted norms (push-ups, plank, squat, a 1.6 km run or a step test, plus lift e1RMs for gym users). An S-rank user is genuinely fit, and that makes rank a status symbol worth sharing.
2. **The Shadow-Self Boss.** Your weekly boss is *you from 4 weeks ago*: a dark mirror version of your avatar that carries your past numbers. Beat its HP by out-performing your past self (more volume, a better e1RM, a faster pace). It is personal and fair, it works for beginners and advanced users alike, and it is built on progressive overload.
3. **True Stats vs Skill Tree.**
   - *True Stats* (STR / AGI / END / VIT / SPI) are computed from real data and cannot be bought or allocated.
   - *Ability Points* from leveling up unlock **Skill Tree nodes**, which are real exercise progressions (push-up → diamond → archer → one-arm; squat → pistol). A node unlocks only after you prove the prerequisite (for example, 3 clean pistol squats). Spending AP also **steers your program** ("I want my next block to be agility-focused").
4. **Classes = training styles.** Fighter (strength/powerlifting), Assassin (calisthenics/skills), Juggernaut (hypertrophy), Ranger (running/endurance), Monk (mobility/yoga/core). You can change class each Season, and the multi-class route ("Hybrid") unlocks at rank C.
5. **The System as an AI narrator.** Every message, quest and debrief comes in the in-world voice of "The System": cold, cryptic, sometimes funny. It is powered by an LLM with strict templates and guardrails, and it is personalized ("Your squat volume decreased 18%. The System has noticed.").
6. **Seasons = training blocks = story arcs.** One Season is 8 weeks: one periodized block plus a deload. It unlocks manga-panel story chapters as you hit milestones. The Season finale is a Rank Trial window.
7. **Nutrition as Mana.** Your daily macros show as HP/MP-style bars. Hitting your protein target means "Mana fully restored". Under-eating protein for 3 days triggers a "Mana Depletion" debuff on the avatar (cosmetic only). Under the hood it is a serious adaptive-TDEE engine.
8. **An avatar that physically evolves.** A layered Rive character whose posture, physique silhouette, aura colour and gear change with rank and class. Your E-rank avatar looks tired in a hoodie; your S-rank avatar glows. The transformation moment is the screenshot people will share.
9. **Humane hardcore.** Missed a day? You land in the **Penalty Zone**: the next day brings a short 5-minute Penalty Quest that restores your streak. Sick or injured mode freezes everything. Poor sleep or HRV (when a wearable is connected) triggers a **Recovery Arc** with mobility quests. It feels hardcore, but it is designed so people don't churn on their first bad week.
10. **Guild Raids.** Guilds of up to 20 people fight a weekly Raid Boss with a shared HP pool. Every member's verified training volume deals damage, and the leaderboard shows contribution as a percentage of each person's own baseline, so beginners matter as much as veterans.
10b. **The Hall: a global community.** Monthly "Top Hunters" boards that reward consistency and improvement (not genetics), a public feed for progress posts and milestones, comments, and a Hall of Hunters for past winners. Trust levels and pre-moderation keep it safe at global scale.
11. **Hidden Quests.** Secret achievements, revealed only when triggered: "Train at 5 AM 7 times", "Leg day on a Friday", "Log every meal for 30 days". The anime fanbase loves discovering and sharing these.
12. **Titles.** Earnable titles shown under your name: *"The One Who Never Skips Leg Day"*, *"Protein Archmage"*, *"Dawn Hunter"*.

---

## 3. Core Game Loop

```
            ┌──────────────── DAILY ────────────────┐
 Notification ([SYSTEM] Daily Quest has arrived)
   → Daily Quest (5–20 min, scaled to you)  ─┐
   → Main Quest: today's program workout      ├─► XP + Stat recalculation + Streak
   → Side Quests: protein, steps, water, sleep ┘     │
                                                     ▼
            ┌──────────────── WEEKLY ───────────────┐
   Shadow-Self Boss · League placement · Guild Raid · System Debrief
                                                     ▼
            ┌──────────────── SEASON (8 wks) ───────┐
   Story chapters · Season pass track · Deload "Meditation Arc" · Rank Trial
                                                     ▼
                         Rank up → avatar evolution → share card
```

### 3.1 Mission / quest types
| Type | Frequency | Example | Reward |
|---|---|---|---|
| **Daily Quest** | Every day at your chosen time | 3 movements, auto-scaled: "20 push-ups (any variation), 40 squats, 60 s plank" | XP, streak |
| **Main Quest** | Training days (from your program) | "Gate B-07: Upper Push, 6 exercises" | Big XP, stat updates |
| **Side Quests** | Daily, pick 3 of 5 | Hit protein, 8k steps, 2 L water, 7 h sleep, log all meals | Small XP, Mana |
| **Weekly Boss** | Weekly | Shadow-Self: beat last month's volume on legs | Loot (cosmetic), title progress |
| **Rank Trial** | Unlocked at level threshold, retry every 7 days | C-rank trial: 35 push-ups, 2:00 plank, 1.6 km under 9:00 (norms adjusted) | Rank up and avatar evolution |
| **Event Gates** | Limited-time (2–7 days) | "Red Gate: 1,000 total reps this weekend" | Exclusive cosmetic |
| **Hidden Quests** | Secret | See §2.11 | Title + rare frame |
| **Penalty Quest** | After a missed daily | 5 min: 30 burpees or 3-minute wall-sit | Restores streak |

---

## 4. Progression System (Design + Math)

### 4.1 XP
XP is effort **relative to you**, so beginners and advanced users level at a similar pace:

```
set_xp      = 10 × effort_factor        // effort_factor 0.5–1.5 from RIR/RPE or %e1RM
session_xp  = Σ set_xp × completion_ratio + completion_bonus(50)
quest_xp    = template.base × difficulty_tier
daily_cap   ≈ 1.5 × expected daily XP   // anti-grind; also prevents overtraining incentive
```
- Cardio: XP per minute weighted by zone (from HR if available, otherwise RPE).
- Nutrition: XP for *logging consistency* and protein adherence. **Never XP for eating less.** (See §11 on eating-disorder safety.)
- **All rewards are computed server-side** from the event log (§9.4).

### 4.2 Level curve
`cumulativeXP(L) = round(65 × (L − 1)^1.77)`. The full table and all XP sources are in [SYSTEMS.md §4](SYSTEMS.md). The table below is the target it was fitted to.
Target pacing for a user training 3–4×/week who also does daily quests:
| Milestone | Target time |
|---|---|
| Level 5 | Day 3 (fast early dopamine) |
| Level 10 | ~2 weeks |
| Level 25 | ~2–3 months |
| Level 50 | ~9–12 months |
| Level 100 | ~3+ years (prestige: "Sovereign" tiers) |

### 4.3 Ranks
| Rank | Level required | Trial standard (rough percentile vs. age/sex norms) |
|---|---|---|
| E | Start | — |
| D | 10 | ~30th |
| C | 25 | ~50th |
| B | 40 | ~70th |
| A | 60 | ~85th |
| S | 80 | ~95th |
| Sovereign I–V | 100+ | Prestige seasons |

Trials have **home and gym variants**, and per-class variants (a Ranger's trial weights the run, a Fighter's weights the lifts). Above A-rank, leaderboard placement needs **verified trials** (HR data attached, or a short video reviewed by peers or a moderator).

### 4.4 True Stats (0–100 underlying, displayed ×10 for drama, e.g. "STR 437")
| Stat | Computed from |
|---|---|
| **STR** | Gym: best e1RM (Epley) on key lifts ÷ bodyweight vs. strength standards. Home: highest calisthenics progression level reached |
| **AGI** | Run/walk pace, step-test HR recovery, interval performance, VO2max estimate from HealthKit / Health Connect |
| **END** | Max-rep tests, plank time, weekly training volume trend |
| **VIT** | 14-day averages of sleep, protein adherence, hydration and resting HR |
| **SPI** | Discipline: 28-day quest completion %, logging adherence, streak |

Stats decay *slowly* with inactivity (detraining is real), which gives people a reason to come back without punishing them hard.

### 4.5 Streaks
- Daily streak = any Daily Quest completed. Rest days scheduled in your program **count** if you do the 3-minute "Rest Ritual" (mobility/breathing).
- 2 Streak Shields per month (free), plus more from the season pass. Sick Mode: up to 7 days per month, frozen.

---

## 5. Training Engine (the Serious Part)

> Hire a **CSCS-certified coach** as a paid consultant to review every template. This is the credibility moat against the clones.

### 5.1 Inputs from onboarding
Goal (lose fat / build muscle / get strong / get athletic / general), experience (Beginner <6 months, Novice 6–18 months, Intermediate 1.5–4 years, Advanced 4+ years), location (Home / Gym / Hybrid), **equipment inventory** (none, pull-up bar, bands, dumbbells with weight range, kettlebell, bench, full gym), days per week (2–6), session length (15/30/45/60/75 min), injuries and limitations, class.

### 5.2 Program library (MVP: ~16 templates, generated into weekly plans)
| Level | Home | Gym |
|---|---|---|
| Beginner | Full-body bodyweight 3×/wk, linear reps | Full-body machines + DB 3×/wk |
| Novice | Calisthenics fundamentals (skill tree); DB full-body | Linear progression (5×5-style), Upper/Lower 4× |
| Intermediate | Calisthenics push/pull/legs, weighted vest optional | PPL 6×, Upper/Lower with DUP |
| Advanced | Skill blocks (planche, front lever, HSPU) | Block periodization: hypertrophy → strength → peak |

Plus class modules: Ranger (Couch-to-5K style → 10K, Zone 2 + intervals) and Monk (mobility/yoga flows).

### 5.3 Programming rules the engine enforces
- **Volume:** 10–20 hard sets per muscle per week (lower for beginners), tracked per muscle group.
- **Progression:** novices use double progression (rep range → add load or a harder variation). Intermediate and up use RIR/RPE-based autoregulation with e1RM tracking.
- **Deload** every 4–6 weeks (the "Meditation Arc"), or earlier if performance drops 2 sessions in a row.
- **Substitutions:** every exercise has tagged equivalents by movement pattern, equipment and difficulty. "Machine taken?" lets you swap it in one tap.
- **Regressions/progressions** for every bodyweight move (this powers the Skill Tree).
- Warm-up sets are auto-generated. Rest timers are set by exercise type (compound 2–3 min, accessory 60–90 s).
- **Time-squeeze:** when a user has only 20 minutes today, keep the compounds, drop accessories and superset the rest.

### 5.4 Exercise library (MVP: 250–300 exercises)
Each one has: animated demo (looping 3D or 2D anime-style clip; see §8), muscles (primary/secondary), pattern, equipment, difficulty, cues (3 bullets), common mistakes, substitutions, progression links, and a unilateral flag.
- **Content cost warning:** exercise demos are the single biggest content cost. Options: license a library (e.g. a 3D exercise-animation vendor) and restyle it with a cel-shade shader, or commission a stylized 2D set. Budget for this early.

### 5.5 Workout logger UX (has to beat Hevy)
- Previous session's weight and reps pre-filled in ghost text; one tap marks a set done.
- Plate calculator, RPE/RIR picker, rest timer with a **Live Activity / Dynamic Island** (iOS) and an ongoing notification (Android).
- Works fully offline; sync happens later.
- PR detection, which triggers a "LIMIT BROKEN" animation and haptics.
- Supersets, drop sets, AMRAP, timed sets and EMOM/Tabata for home sessions.
- Each session is framed as a **Gate**: a progress bar shown as Gate HP, with the final set as the "boss phase".

---

### 5.6 Workout types (every type a real coach programs)
| Type | What it's for | Typical session | Where |
|---|---|---|---|
| **Strength** | Maximal force, bone density | 45–75 min, heavy compounds | Gym / Hybrid |
| **Hypertrophy** | Muscle size and shape | 40–70 min, 6–15 reps near failure | All |
| **Calisthenics** | Bodyweight mastery and skills | 30–60 min, progression chains | All |
| **HIIT / Conditioning** | Work capacity, fat loss in less time | 15–30 min intervals and circuits | All |
| **Zone 2 Cardio** | Aerobic base, recovery, heart health | 30–60 min conversational pace | All |
| **Core** | Trunk strength, back health | 10–20 min add-on | All |
| **Mobility & Recovery** | Range of motion, joint health | 10–30 min flows | All |
| **Power & Athletic** | Speed, jumps, explosiveness | 30–45 min, low reps, full rest | All |

The content lives in `@lb/content/workout-types.json`. Prescription rules for each type are in [SYSTEMS.md §3.8](SYSTEMS.md).

### 5.7 Session anatomy (what every workout looks like)
1. **Readiness check** (optional, 3 taps). Low readiness offers a lighter swap.
2. **Warm-up** (5–8 min): general movement, then specific ramp-up sets for the first lift.
3. **Main block**: the compound lift(s) with prescribed sets × reps @ RIR and a suggested load.
4. **Accessory block**: 2–4 exercises, often as supersets to save time.
5. **Finisher** (optional): short conditioning, framed as the Gate's "boss phase".
6. **Cool-down** (3–5 min): mobility for the muscles trained.
7. **Debrief**: session RPE, notes, PRs, XP, and what changes next time.

### 5.8 The Coach layer (what makes it feel like a real trainer)
- **Today's workout is always ready:** generated from the active program, the user's equipment, time available and readiness.
- **The "why" for every exercise:** one line, e.g. "Builds pressing strength for your Fighter path."
- **Form coaching:** demo animation, 3 cues, common mistakes, the target muscles.
- **A load for every set:** from e1RM and target RIR, or the next progression variant for bodyweight.
- **Rest timer** with a "next up" preview, plus a Live Activity on iOS.
- **Auto-adjust:** if the logged RIR misses the target by 2 or more, the next set's load or reps change.
- **Swap** ("machine taken") and **pain flag** ("this hurts" → regression or alternative, remembered as an injury tag).
- **On-demand sessions:** 7-min Express, 15-min HIIT, 10-min Mobility, 12-min Core and a 5-min Desk Reset, for days the plan doesn't fit.
- **Weekly coach review:** volume per muscle, PRs, adherence and next week's adjustments, in plain language with a short System line.

### 5.9 Program catalogue (MVP, original names)
| Program | Level | Setting | Days | Notes |
|---|---|---|---|---|
| Foundation | Beginner | Home | 3 | Full-body bodyweight, learns the basic patterns |
| Shinobi Path | Novice–Int. | Home | 4 | Calisthenics skill chains (push, pull, legs, core) |
| Home Hypertrophy | Novice–Int. | Home (DB/bands) | 4 | Upper/Lower |
| Burn Protocol | All | Home | 3–5 | Strength circuits + HIIT for a cut |
| Iron Foundation | Beginner | Gym | 3 | Full body, machines + dumbbells |
| Linear Strength | Novice | Gym | 3 | 5×5-style linear progression |
| Upper/Lower Builder | Intermediate | Gym | 4 | Hypertrophy with daily undulating loads |
| Juggernaut PPL | Int.–Adv. | Gym | 6 | Push/Pull/Legs |
| Powerbuilding | Intermediate | Gym | 4 | Strength top sets + hypertrophy back-off |
| Ranger Run | Beginner | Any | 3 | Walk-to-5K over 9 weeks |
| Zone 2 Engine | All | Any | 2–4 | Aerobic base block |
| Monk Mobility | All | Any | Daily | 10–20 min flows |
| Core Forge | All | Any | 3 | 10-min add-on |
| Athletic Power | Intermediate | Gym/Hybrid | 3 | Jumps, throws, sprints + strength |

Each program is a JSON template in `@lb/content/programs/` (weeks → days → slots by movement pattern). The engine fills the slots with exercises that fit the user's equipment and injuries. The coach consultant must review every template before launch.

## 6. Nutrition: "Mana System" (Realistic Macro Tracking)

### 6.1 Logging methods (fastest first)
1. **Barcode scan** (expo-camera) → Open Food Facts, then a paid DB fallback.
2. **AI photo logging:** photo → backend → vision LLM returns structured items with estimated grams → user confirms or adjusts on sliders. *Always editable, never silently trusted.*
3. **Search:** a unified search across our curated DB, USDA FoodData Central and the branded DB, ranked by the user's history.
4. **Recents, favourites and meal templates** ("My usual breakfast"), plus copy yesterday.
5. **Recipe builder** (per-serving macros), and **quick add** (kcal/P/C/F only).
6. Voice log ("2 eggs and toast"), parsed by the LLM in Phase 2.

### 6.2 Food data strategy
| Source | Use | Cost |
|---|---|---|
| USDA FoodData Central | Generic and whole foods, high accuracy | Free, public domain |
| Open Food Facts | Barcodes, global coverage | Free (ODbL: attribution + share-alike on the DB itself, so check with counsel) |
| FatSecret Platform or Nutritionix | Restaurant / branded coverage, regional DBs (BR, MX) | Paid; get quotes |
| **Our curated table** | Normalize everything into one `foods` table, dedupe, verified flag, cache all lookups | — |

Show a "verified" badge. User-created foods stay private unless a moderator verifies them (avoids the MFP dirty-data problem).

### 6.3 Adaptive TDEE (MacroFactor-style)
The final formulas (weight trend, adaptive TDEE, calorie targets, macro split, safety rails, a worked example) are in **[SYSTEMS.md §1–2](SYSTEMS.md)**.

In short: a gap-aware weight trend → TDEE observed from intake and the weight slope → recursive, confidence-weighted update from a Mifflin/Katch prior → targets set by a %BW/week goal rate, with deficit caps, calorie floors, an under-18 rule and ±150 kcal weekly smoothing.

### 6.4 Gamified layer (light touch)
- HP/MP bars for calories and protein. Hitting protein → "Mana fully restored" plus small XP.
- Logging streak → title "Alchemist".
- *No* XP for a bigger deficit, ever.
- Hire a **registered dietitian** for a one-time review of targets, copy and safeguards.

---

## 7. Onboarding: "The Awakening" (~3–4 minutes, 14 steps)

The goal is to make the user *feel the anime moment* in the first 60 seconds, collect everything the training and nutrition engines need, and show the paywall at peak emotion.

| # | Screen | Purpose | Notes |
|---|---|---|---|
| 1 | **Cold open**: black screen, glitch SFX, then a System window types out: *"You have been chosen. Do you accept?"* [ACCEPT] | Hook | Skippable after first view; haptics |
| 2 | Hunter name + avatar base (skin tone, hair, eyes) | Ownership | Rive avatar preview reacts live |
| 3 | Goal (5 options with anime-style icons) | Program + nutrition | — |
| 4 | Experience level (with plain-language descriptions) | Tier | "Can you do 10 push-ups?" helper |
| 5 | Where you train: Home / Gym / Hybrid → equipment checklist | Program | Equipment saved as "Inventory" |
| 6 | Days per week + session length + preferred time | Schedule + notification time | — |
| 7 | **Choose your Class** (5 cards, flip animation) | Identity | Shows the recommended class based on the goal |
| 8 | Body stats: sex (for norms), age, height, weight, optional body-fat % | TDEE, norms | Units toggle |
| 9 | Health screen (PAR-Q style): injuries, heart conditions, pregnancy | Safety | "Consult a doctor" gate if any answer is yes |
| 10 | **Awakening Assessment** (optional, 3 min): max push-ups, plank hold, squats in 60 s | Starting stats + initial rank | Can skip → estimated |
| 11 | Nutrition setup: tracking style (full macros / protein only / off), diet preference | Fuel | Respect "off" fully |
| 12 | Connect Apple Health / Health Connect | Steps, HR, weight, sleep | Pre-permission primer screen |
| 13 | Notifications primer: *"The System will deliver Daily Quests at 07:00"* → OS prompt | Retention | Primer first, *then* the OS prompt |
| 14 | **STATUS WINDOW REVEAL**: full-screen animated stats, rank E, class, first Daily Quest | Peak emotion | → Paywall (trial) → Home |

**Paywall:** soft, with a 7-day trial on the annual plan and clear "continue free" text. A/B test it via RevenueCat Paywalls or Superwall.
**Account:** allow guest mode first. Ask for Sign in with Apple / Google after the first workout ("Save your progress, Hunter").

---

## 8. Characters, Art & Animation

### 8.1 Cast (original IP)
- **The Player Avatar**: layered and customizable; evolves at every rank (posture → physique silhouette → aura → gear).
- **The Guide** (mentor): a single main character who delivers tutorials, debriefs and story beats. Give them 30–50 expressions/poses. This is your mascot (your Duo owl).
- **The Shadow-Self**: a dark mirror of the user's avatar (cheap, because it reuses the avatar rig with a shader).
- **Rival NPCs per class** (Phase 3).

### 8.2 Tech for animation
| Need | Tool |
|---|---|
| Interactive characters (idle, cheer, disappointed, level-up), state machines driven by app state | **Rive** (`rive-react-native`): small files, runtime state machines, swappable layers for avatar parts |
| Aura, particles, glow, glitch, System window effects | **React Native Skia** (+ shaders) |
| UI motion, gestures, number tickers | **Reanimated 4** + Gesture Handler |
| Simple icon/celebration loops | Lottie (only where Rive is overkill) |
| Feel | `expo-haptics` (level-up pattern, PR pattern), `expo-audio` SFX, optional BGM |

### 8.3 Art direction and pipeline
- Visual identity: **not** the Solo Leveling blue window. Pick your own palette and "System UI" language (e.g. violet/crimson HUD, angular frames, a custom font pairing with a JP-style display font).
- **Hire human anime artists** (Skeb, ArtStation, VGen) for key art and characters, then a **Rive animator** to rig them. The anime community reacts strongly against AI-generated art; use AI only for internal concepting.
- Manga-panel story chapters: 6–10 panels per chapter, about 4 chapters per Season.
- Optional later: Japanese voice lines for The Guide (premium flavour, a big hit with this audience).

---

## 9. Technical Architecture

### 9.1 Stack
| Layer | Choice | Why |
|---|---|---|
| App | **Expo (latest SDK at kickoff, currently SDK 58)**, React Native New Architecture, TypeScript strict | New Arch is mandatory from SDK 55. EAS covers build, submit and OTA |
| Navigation | **Expo Router** (NativeTabs + Stack) | Typed routes, deep links for notifications |
| Local DB (offline-first) | **expo-sqlite + Drizzle ORM** | Gyms have bad signal; the logger must never wait on the network |
| Sync | Outbox queue → Supabase (or **PowerSync** if you want managed sync) | Conflict-safe event log |
| Server state | TanStack Query | Caching, retries |
| UI state | Zustand | Simple |
| Styling | Unistyles 3 or NativeWind + a design-token package | Theming, performance |
| Backend | **Supabase**: Postgres, Auth (Apple/Google/email), RLS, Edge Functions, Realtime (guild raids), Storage, pg_cron | Fast to build, SQL, scales far enough |
| AI | **Claude API** through Edge Functions (never from the client): food photo parsing, System voice, quest generation, weekly debriefs | Structured output, guardrails |
| Health | `@kingstinct/react-native-healthkit` (iOS), `react-native-health-connect` (Android) | Steps, HR, workouts, weight, sleep |
| Camera | `expo-camera` (barcode), `expo-image-picker` / camera for food photos | — |
| Payments | **RevenueCat** (`react-native-purchases`) + RevenueCat Paywalls or Superwall | Cross-platform entitlements, A/B tests |
| Notifications | `expo-notifications` (local) + Expo Push Service (remote), scheduled server-side | §10 |
| Widgets / Live Activities | Expo widgets support (check SDK 58 docs) or `@bacons/apple-targets` for iOS; Android widgets | Status widget, Daily Quest widget, rest-timer Live Activity |
| Analytics / flags | PostHog (events, funnels, feature flags, experiments) | — |
| Crashes | Sentry | — |
| i18n | `expo-localization` + i18next | EN, PT-BR, ES, FR → JA, KO |
| Testing | Jest + React Native Testing Library, **Maestro** E2E, a simulation script for XP/level pacing | — |
| CI/CD | EAS Workflows: preview builds per PR, OTA to the staging channel, store submit | — |

### 9.2 Project structure
```
limitbreak/
  app/                      # Expo Router routes
    (onboarding)/           # awakening flow
    (tabs)/
      index.tsx             # STATUS (home: status window, daily quest, avatar)
      quests.tsx            # QUESTS (daily, side, weekly boss, events, hidden)
      train/                # GATES (program, logger, history, exercise library)
      fuel/                 # MANA (diary, scan, photo, search, trends)
      guild/                # GUILD (raids, leagues, friends, rivals)
    paywall.tsx  settings/  rank-trial/  story/
  src/
    features/               # feature-sliced: training, nutrition, progression, social, story
    engine/                 # PURE TS, shared with the server, fully unit-tested
      progression/          # xp, levels, ranks, stats formulas
      training/             # program generator, progression rules, substitutions
      nutrition/            # TDEE estimator, targets, trend smoothing
    db/                     # drizzle schema, migrations, outbox sync
    ui/                     # design system: SystemWindow, StatBar, GateHPBar, RankBadge
    animation/              # rive assets, skia effects
    services/               # health, notifications, purchases, analytics
  supabase/
    migrations/  functions/ (reward-calculator, food-photo, system-voice, push-scheduler)
  content/                  # exercises.json, programs/*.json, quests/*.json, story/*.json
```
**Key decision:** `src/engine/` is pure TypeScript with no React, imported by both the app (for instant optimistic UI) and the Edge Functions (as the authoritative calculation). It is a single source of truth for the game math.

### 9.3 Core data model (Postgres; mirrored locally in SQLite where needed)
```
users, profiles (name, sex, dob, height, units, class, goal, experience, location)
equipment_inventory
hunter_state (level, xp, rank, ap_unspent, streak, shields, season_id)
stats_snapshots (date, str, agi, end, vit, spi)          -- history for charts
event_log (id, user_id, type, payload jsonb, client_ts, server_ts, verified)  -- source of truth
xp_ledger (event_id, amount, reason)                     -- derived, server-written only
exercises, exercise_relations (substitute|progression|regression)
program_templates, program_instances, planned_workouts
workout_sessions, workout_sets (weight, reps, rir, rpe, duration, distance, hr_avg)
personal_records
quest_templates, quest_instances (status, due_at, scaled_targets jsonb)
rank_trials, trial_attempts (results, percentile, verification)
skill_nodes, user_skills
foods (source, source_id, verified, per100g macros, micros jsonb), food_servings
food_logs, meal_templates, recipes
body_metrics (weight, bf%, waist, source)
tdee_estimates (date, trend_weight, expenditure, confidence)
nutrition_targets (effective_from, kcal, p, c, f)
achievements, user_achievements, titles
guilds, guild_members, raids, raid_contributions
leagues, league_memberships
cosmetics, inventory_items, season_pass_progress
notification_prefs, push_tokens
```

### 9.4 Anti-cheat and integrity
- The client sends **events** (set logged, quest completed). The server's `reward-calculator` computes the XP. The client only shows a prediction.
- Plausibility checks: sets per minute, load jumps > X% over e1RM, impossible rep counts, timestamp sanity. Suspicious events are flagged, earn no leaderboard credit, and the user is never accused.
- Leaderboards and leagues count only verified or plausible data. Rank Trials above A need verification (§4.3).

### 9.5 Performance and quality bar
- Cold start under 2 s on a mid-range Android device. Lazy-load Rive files. App download under 60 MB, with story art streamed or downloaded on demand.
- Logger interactions under 16 ms per frame. Every write goes to local SQLite first.
- Accessibility: reduce-motion setting (disables heavy Skia effects), dynamic type, VoiceOver labels on the logger.

---

## 10. Notifications Strategy

All copy is in the **System voice**, localized, with the user's name and rank.

| Trigger | Example copy | Type |
|---|---|---|
| Daily Quest drop (user's chosen time) | `[SYSTEM] Daily Quest has arrived. Failure to complete will result in an appropriate penalty.` | Local, scheduled |
| Training day, 1 h before the usual time (learned from history) | `[SYSTEM] Gate B-07 has opened. Estimated clear time: 42 min.` | Local |
| Streak at risk (2 h before midnight) | `[SYSTEM] Your 23-day streak will collapse in 2 hours.` | Local |
| Penalty Zone | `[SYSTEM] You have entered the Penalty Zone. Survive 5 minutes to restore your streak.` | Local |
| Protein low by evening | `[SYSTEM] Mana at 40%. 62 g protein remaining.` | Local |
| Rank Trial unlocked | `[SYSTEM] You are eligible for promotion. The Trial awaits.` | Push |
| Guild raid events | `[GUILD] The Raid Boss is at 12% HP. 3 hours remain.` | Push (server) |
| Weekly debrief ready | `[SYSTEM] Weekly report compiled. The System has… observations.` | Push |
| Win-back (3/7/14 days inactive) | `[SYSTEM] Your Shadow-Self grows stronger while you rest.` | Push |

**Rules:**
- At most **2 marketing-type pushes per day**, quiet hours enforced, and every category toggleable.
- Send-time optimization from the user's actual workout times.
- Rest timer uses a Live Activity on iOS and an ongoing notification on Android.
- Deep links (`limitbreak://gate/today`) open straight into the right screen through Expo Router.

---

## 11. Safety, Legal and Store Compliance

- **IP:** no "Solo Leveling", "Sung Jin-Woo", "Arise", "Shadow Monarch", "Hunter Association" or similar, and no lookalike UI. Generic LitRPG tropes (status windows, ranks, gates) are fair game; their specific expression is not. Get a short legal review of the name and key art.
- **Eating-disorder safeguards:** calorie floors, no deficit for under-18s, an option to hide calories and track protein only, no XP for restriction, a soft check-in if the user logs very low intake repeatedly, plus a resources link.
- **Overtraining:** the daily XP cap, mandatory deloads and the Recovery Arc remove any incentive to grind injuries.
- **Medical disclaimer** and a PAR-Q gate at onboarding.
- **Age gate:** 13+ (16+ in some EU countries for data consent). No public social features for minors by default.
- **Health data:** Apple HealthKit and Google Health Connect data must not be used for advertising. Write a privacy policy that covers both. GDPR/CCPA export and delete.
- **Loot and cosmetics:** no paid random loot boxes (some regions regulate them, and it is wrong for a health app). Cosmetics are direct purchase or season-pass rewards.
- **App Store:** subscriptions follow guideline 3.1.2 (clear terms, restore purchases). Sign in with Apple is required if you offer Google sign-in.

---

## 12. Monetization

> Subscriptions are switched on **after the full app is built**. Feature gates exist from day 1 but stay open. The final free/premium split, store and RevenueCat setup, webhooks and the launch transition are in [SYSTEMS.md §7](SYSTEMS.md).

| Free (generous; this is the growth engine) | **Premium "Awakened"** (~$9.99/mo · $59.99/yr · regional pricing) |
|---|---|
| Daily Quests, streaks, leveling, ranks and Rank Trials | Full adaptive programs (all classes, all tiers, auto-progression) |
| 3 starter programs (home + gym) | Adaptive TDEE + weekly macro adjustments |
| Workout logger (unlimited) | AI photo food logging + voice logging |
| Manual + barcode food logging, static macro targets | Shadow-Self Boss full analytics, advanced stats history |
| Guild membership, leagues | Premium season-pass track (cosmetics, story chapters early) |
| Base avatar + earned cosmetics | Exclusive avatar evolutions, auras, frames |

- **Never pay-to-win:** XP, stats and rank can't be bought.
- Extra IAP: cosmetic packs and seasonal outfits.
- Use RevenueCat for entitlements and experiments. Expected healthy targets: trial start 8–15% of installs, trial → paid 35–50%.

---

## 13. Navigation Map

```
Tabs:  HOME  |  TRAIN  |  QUESTS  |  NUTRITION  |  COMMUNITY
HOME      : greeting + streak · hunter card (sigil, level, power, rank, XP) · today rings (workout, quest, protein)
            · today's workout · Daily Quest (System card) · True Stats
TRAIN     : this week · start today's workout → logger · workout types · on-demand sessions · programs
            · exercise library · history · PRs · skill tree
QUESTS    : Daily · Side · Weekly Boss (Shadow-Self) · Events · Hidden · Rank Trial entry
NUTRITION : calories ring + targets · macros (protein = "Mana") · log (scan / photo / search) · diary · weight trend
COMMUNITY : The Hall (global feed: Following · Global · My Rank) · Top Hunters of the Month boards
            · Guild (raid, chat) · Friends (streaks, duels, DMs 18+) · Hunter License card · Hall of Hunters
Global    : level-up / rank-up cinematics · onboarding · paywall (later) · settings
```
Anime terms stay as flavour inside screens (Gates, Mana, the System), never as the only label.

---

## 14. Roadmap

### Phase 0: Foundation (3 weeks)
- Name + trademark check, art direction, Guide + avatar concept art commissioned.
- Clickable Figma prototype of onboarding, Status, Logger and Mana. Test it with 10–15 target users (anime Discords and subreddits).
- Expo + EAS setup, CI, Supabase project, design tokens, `engine/` skeleton with tests.
- Coach consultant: program templates v1. XP/level simulation to tune the curve.

### Phase 1: MVP (10–12 weeks) → soft launch (PH, BR, MX or one small English-speaking market)
- Awakening onboarding (all 14 steps), guest mode, then Apple/Google sign-in.
- Status screen with Rive avatar (E and D rank looks) and The Guide (core expressions).
- Daily Quests, Main Quests and Side Quests; streaks + shields; Penalty Zone.
- 8–10 program templates (home + gym, Beginner → Intermediate), 250 exercises with demos.
- Logger (offline, PR detection, rest timer, Live Activity).
- XP, levels, ranks E→C, Rank Trials (home + gym variants), True Stats.
- Nutrition: barcode, search (USDA + OFF), quick add, recents, static targets.
- Notifications (local + push), HealthKit / Health Connect (steps, weight, workouts).
- Feature-gate layer (open), PostHog, Sentry, EN + PT-BR + ES. Subscriptions come after the full build (SYSTEMS.md §7).

### Phase 2: Depth (8 weeks)
- Adaptive TDEE + weekly System Debrief (AI voice).
- AI photo logging, recipes, meal templates.
- Shadow-Self weekly boss, Skill Tree, Hidden Quests, Titles.
- Weekly leagues, friends and rivals, shareable rank/stat cards.
- Home screen widgets, ranks up to S, Advanced programs, Ranger + Monk classes.

### Phase 3: Live game (ongoing)
- Seasons + story chapters + season pass, Event Gates.
- Guilds + Raids (Supabase Realtime).
- Apple Watch / Wear OS companion (logger + HR verification).
- JA/KO localization, Japanese voice lines, creator / influencer guild events.

### Team (lean)
2 React Native engineers (one with animation skills) · 1 backend/full-stack · 1 product designer (UI/motion) · 1 illustrator + 1 Rive animator (contract) · fitness coach (CSCS) + registered dietitian (contract) · part-time community manager (Discord and TikTok are the growth channels for this niche).

---

## 15. Metrics That Matter

| Metric | MVP target |
|---|---|
| Onboarding completion | ≥ 70% |
| D1 / D7 / D30 retention | 40% / 20% / 10%+ (top-quartile health & fitness) |
| Daily Quest completion rate (active users) | ≥ 60% |
| Workouts per active user per week | ≥ 2.5 |
| Users logging food ≥ 4 days per week (of those who enabled it) | ≥ 35% |
| Install → trial / trial → paid | 8–15% / 35–50% |
| Share-card exports per 100 rank-ups | ≥ 15 (virality proxy) |

North-star metric: **Weekly Cleared Gates per user**, meaning real workouts completed.

---

## 16. Go-to-Market Hooks (Niche-Specific)

- TikTok and Reels: "Day 1 vs Day 90 of letting an app turn me into an anime protagonist" (the avatar evolution plus real progress photos).
- A shareable **Hunter License card** (rank, class, stats, title), designed to be screenshotted.
- Discord server with in-app guild linking, and weekly global raid events.
- Partner with fitness/anime crossover creators (calisthenics and "anime workout" creators). Run creator-led guild events.
- Launch with a limited **"Founders' Gate"** event and an exclusive first-season aura.

---

## 17. Open Decisions (Need Your Input)

1. Final name and art direction (dark-fantasy vs cyberpunk vs shōnen-bright).
2. Exercise demo approach: licensed 3D library restyled, or commissioned 2D (cost vs. uniqueness).
3. Managed sync (PowerSync) vs a custom outbox: speed vs. cost.
4. Soft-launch market.
5. Budget for art and animation, which is the biggest non-engineering cost and the biggest differentiator.

---

### Research sources
- Solo-Leveling-style competitors: [App Store: Solo Level: System](https://apps.apple.com/us/app/id6755756882), [Solo Leveling System on Product Hunt](https://www.producthunt.com/products/solo-leveling-system/launches), [Solo Level Arise (AppGoblin)](https://appgoblin.info/apps/arisesolo.com), [Ascension System](https://mwm.ai/apps/ascension-system/6774011443), [Solo X Player](https://apps.apple.com/us/app/-/id6748594462), [AniGains](https://appgoblin.info/apps/6759811590), [FitVerso](https://mwm.ai/apps/fitverso/6759553681)
- Gamified fitness overviews: [FitCraft: fitness RPG apps](https://getfitcraft.com/guides/fitness-rpg-apps), [FitCraft: best gamified fitness apps](https://getfitcraft.com/compare/best-gamified-fitness-apps), [AppsHunter: RPG fitness](https://appshunter.io/ios/topics/rpg-fitness)
- Nutrition: [MacroFactor vs Cronometer](https://macrofactor.com/macrofactor-vs-cronometer/), [MacroFactor review 2026](https://calorie-trackers.com/reviews/macrofactor/), [Open nutrition datasets compared](https://nutrola.app/en/blog/open-nutrition-datasets-compared-usda-openfoodfacts-nutrola), [FatSecret Platform API](https://platform.fatsecret.com/api)
- Expo: [Expo SDK 56](https://expo.dev/sdk/56), [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55), [Expo New Architecture guide](https://docs.expo.dev/guides/new-architecture), [Expo SDK 58 changelog](https://expo.dev/changelog/sdk-58.md)

---

## 18. Design Principles (v3)

1. **Fitness app first, anime second (roughly 80/20).** Anime appears in a few deliberate places: the hero sigil and rank badge, System messages (Daily Quest, warnings), level-up and rank-up cinematics, and the onboarding cold open. Everything else is calm, premium product UI.
2. **One accent colour** (violet) for actions. Data colours (workout, quest, protein, carbs, fat) are only for metrics. Rank colours are only for rank.
3. **Typography:** Inter for all UI text, Rajdhani for big numbers, Dela Gothic only for brand moments. Sentence case everywhere; uppercase only for small labels.
4. **Surfaces:** neutral cards, hairline borders, 20 pt radius. No neon frames. Glow only on the primary button and System cards.
5. **Motion with purpose:** entrances, progress fills and celebrations. Glitch effects only on brand moments. Reduce Motion is respected.
6. **Plain language first, flavour second:** "Daily Quest · Push-ups 20". No developer text in the UI.
7. **Plain tab names:** Home, Train, Quests, Nutrition, Community.
8. **Accessibility:** 44 pt touch targets, AA contrast, every control labelled for screen readers.

