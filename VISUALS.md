# LIMITBREAK — Workout Visuals, Follow-Along Trainer & Avatar Forge

> Companion to [PLAN.md](PLAN.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [SYSTEMS.md](SYSTEMS.md). This file decides **how training looks and feels**: exercise demos, the follow-along trainer, warm-ups and cool-downs, how workouts are named, and the points-built avatar.
>
> **Rule zero:** this is a real fitness app first. Every visual must make the exercise *clearer and safer* before it makes it cooler. The anime layer frames the training; it never replaces it.

---

## 1. What the Best Fitness Apps Do (and What We Take)

| App | How it shows training | What we take | What we avoid |
|---|---|---|---|
| **Nike Training Club** | Trainer-led video sessions with professional athletes | A follow-along session where a trainer moves with you | Hour-long filmed classes (too expensive for us) |
| **Apple Fitness+** | Trainer video with your metrics over it (heart rate, calories, rings), time **elapsed or remaining**, optional "Burn Bar" comparison, captions on every workout | The metrics layout over the video, the time-display toggle, comparing against past efforts (our Shadow-Self), captions | Locking the experience to a watch |
| **Freeletics** | Exercise animations, and fixed signature workouts named after mythological figures, **identical for every user** | Fixed benchmark workouts you repeat to beat your best time (our **Signature Gates**, §6.4) | Demos without any coaching cues |
| **Hevy** | Exercise demos inside a fast logger | A demo in every exercise row and on the logger screen | — |
| **3D anatomy apps** (e.g. Muscle & Motion) | 3D animations with the working muscles highlighted | A muscle map on every exercise | Clinical anatomy-textbook look |

**Our position:** Hevy-level clarity in the logger, Fitness+-style follow-along for timed sessions, Freeletics-style signature benchmarks, all in one consistent **anime trainer** style that nobody else has.

---

## 2. Visual Building Blocks

### 2.1 Exercise demo (every exercise)
| Asset | Spec | Used in |
|---|---|---|
| **Loop clip** | 3–6 s seamless loop, one full rep at a coachable tempo, front three-quarter angle. 640×640 animated WebP **with transparent background** (so the live aura shows behind the trainer), ≤ 400 KB | Session player, exercise detail, follow-along, quest rows |
| **Side angle** (main lifts and anything with hip/spine position) | Same spec, side view | Exercise detail ("Angle" toggle) |
| **Thumbnail** | Still frame at the hardest position (bottom of the squat, chest near the floor), 240×240 WebP | Lists, program preview, history |
| **Cue marks** | Timestamps in the loop where an on-screen cue appears ("chest to floor" at the bottom) | Follow-along and exercise detail overlays |
| **Muscle map** | Front/back body diagram with primary muscles in accent and secondary at 40% | Exercise detail, workout preview, weekly volume view |

**Muscle map:** we draw our own SVG body (front and back, about 20 regions) and colour it from the existing `primary`/`secondary` muscle tags in `exercises.json`. That avoids any licence, and the same component also powers a **weekly volume map** (which muscles you trained this week, coloured by hard sets per §3.2).

### 2.2 The demo trainers
- **Two original demo trainers** (one male, one female build) made in VRoid in the anime toon style, wearing plain, fitted training clothes so joints and form stay visible. Users pick who demonstrates. The anime power comes from the **live aura** behind them (§3.4), not from costumes, so no capes or weapons in demos.
- **The six heroes** appear in follow-along intros and outros, Signature Gate covers, rank trials and celebrations, not in every rep demo. This keeps the demo library consistent and halves the production work.
- **Master Hoshi** (the Guide) is the coaching voice and narrator across warm-ups, cues and debriefs.

### 2.3 Visual consistency checklist (every demo)
1. Full, coach-approved range of motion; correct tempo (≈ 1 s up, 2 s down unless the exercise says otherwise).
2. Same camera height, distance and lighting for every clip of a type.
3. Unilateral moves show the left side, and the player mirrors for the right.
4. The loop has no visible seam or jump.
5. A coach has signed off on form (our credibility moat; see PLAN.md §5).
6. File size within budget; a still-frame fallback exists for Reduce Motion.

---

## 3. The Animated Trainer: $0 Production Pipeline

**Goal:** an original anime trainer performs every exercise in a clean loop, with a living **aura** behind them that reacts to your effort. **Budget: $0 in licences and subscriptions.** The real cost is hours of work, estimated honestly in §3.7.

### 3.1 The pipeline at a glance
```
VRoid Studio ──► VRM Add-on for Blender ──► motion (Mixamo / video mocap / hand keys)
 (trainer)          (import, MToon toon)        retargeted onto the trainer rig
                                   │
                                   ▼
        Blender EEVEE render rig: fixed camera, toon outline, TRANSPARENT background
                                   │  tools/render/render_exercise.py (batch, from the manifest)
                                   ▼
        ffmpeg ► animated WebP with alpha (loop) + still WebP (thumb)
                                   │
                                   ▼
        App: <ExerciseMedia>  =  Skia aura layer  +  trainer loop on top  +  cue overlay
```
The aura is drawn **live in the app**, not baked into the clip (§3.4). One clip serves every rank, class and effort state, and files stay small.

### 3.2 Tools, costs and licences (checked Nov 2026; re-check each at signup)
| Need | Tool | Cost | Licence position | Notes |
|---|---|---|---|---|
| Trainer model | **VRoid Studio** (pixiv) | Free | Models you make with VRoid's own parts may be used commercially in apps and videos | Use **only built-in parts or our own textures**. Never paid BOOTH parts unless their terms allow app use |
| Import into Blender | **VRM Add-on for Blender** | Free (open source) | Tool only | Keeps the MToon toon shading |
| 3D software and render | **Blender** (EEVEE) | Free (GPL) | Renders are ours, no restrictions | Batch rendering from Python |
| Common motions | **Mixamo** (Adobe) | Free | Royalty-free in commercial projects **when embedded**. We may not redistribute raw FBX files | We ship **rendered clips only**, never the FBX files |
| Gym and skill motions | **Rokoko Vision** (free plan): phone video → FBX | Free | Free-plan exports may be used commercially (Rokoko pricing page) | Single-camera clips may be capped at ~15 s, which is plenty for a 3–6 s loop |
| Backup mocap | MediaPipe-based Blender add-ons (GPL) or **FreeMoCap** (AGPL) | Free | GPL/AGPL apply to the *tool code*; the animation output is ours. We never ship the tool | Use if Rokoko's free plan changes |
| Props (barbell, dumbbell, bench, bar, kettlebell) | Modelled in Blender from primitives, or **CC0** assets (Poly Haven) | Free | CC0 = no conditions | About one day for the whole set |
| Encoding | **ffmpeg** (libwebp) | Free | Tool only | Animated WebP keeps transparency, which MP4 cannot |
| Voice | On-device TTS (expo-speech) now; coach's own recorded lines later | Free | Our recordings are ours | No AI voice clones of real people |
| Hosting | App bundle (Tier 1) + Supabase Storage free plan (Tier 2) | Free | — | See §3.5 |

**Ruled out:** **Ready Player Me** (shut down on 31 Jan 2026 after Netflix bought it); **SMPL-based research mocap** (the body model is licensed for non-commercial use only); **AI video generators** (unclear rights and form that changes between clips, unacceptable for a fitness app); clips or animations taken from other apps or YouTube; any likeness of existing anime characters.

### 3.3 Where each exercise's motion comes from
| Source | Covers | Est. share of our 87 |
|---|---|---|
| **Mixamo**, then cleaned in Blender (tempo, range of motion, seamless loop) | Push-up, squat, lunge, burpee, jumping jack, sit-up and crunch, plank, high knees, mountain climber, stretches | ~30% |
| **Coach video → Rokoko Vision**, then cleaned in Blender | Pull-up, dip, rows, hinge patterns, glute bridge, hip thrust, mobility drills, carries | ~50% |
| **Hand-keyed in Blender**, matched frame by frame to coach video | Bench press, cable and machine moves, anything mocap tracks badly (lying down, heavy props) | ~20% |

**The coach is the reference for every clip.** We film the coach doing the move (front and side). That footage drives mocap, and it is also the form standard each clip is checked against before sign-off.

### 3.4 The aura system (anime power, drawn live in the app)
The trainer clip has a transparent background. Behind it, a **Skia GPU shader** draws the aura: layered flame noise, a rim glow around the silhouette, rising sparks and a ground ring. Because it is live, it **reacts to the workout**:

| State | When | Look |
|---|---|---|
| **Idle** | Intro, exercise detail | Soft breathing glow, slow embers |
| **Charging** | "Get ready" countdown | Aura gathers inward, ground ring forms |
| **Power** | Work phase | Steady flame in rank or class colour |
| **Surge** | Last 3 s, or last 2 reps of a target | Brighter, faster flame, light screen shake (off with Reduce Motion) |
| **Burst** | Set or step completed | Flash, spark burst and a success haptic |
| **Embers** | Rest | Aura dims to embers, so the body visibly cools down |
| **Awakening** | New personal record or rank-up | Gold aura, one-time cinematic burst |

- **Colour:** rank colour from E (spirit-blue, since the badge grey reads as smoke) to S gold (Avatar Forge §7 reuses the same layer). Class can tint it, and Essence cosmetics can restyle it later.
- **Rule zero still applies:** the aura sits **behind** the body, never over it. Its opacity is capped so joints and form stay readable, and it never hides the cue overlay.
- **Accessibility and performance:** Reduce Motion shows a static glow. The shader runs at ≤ 30 fps inside the media box only. Phones that can't keep 60 fps in the UI fall back to the static glow automatically.
- **Baked effects** (Blender emission and particles) are used only for **stills**: Signature Gate covers, rank-trial art and share cards.

### 3.5 Render spec and hosting
- **Camera rig:** one `.blend` scene with locked cameras: front ¾ (default) and side (main lifts and hip/spine moves). Same height, lens, light and floor shadow for every clip.
- **Loop:** one full rep at coaching tempo, 3–6 s, 24 fps, **640×640, animated WebP with alpha, ≤ 400 KB**. Unilateral moves are rendered on the left side only, and the player mirrors them for the right.
- **Thumbnail:** the hardest position (bottom of the squat, chest near the floor), 240×240 WebP, ≤ 25 KB.
- **Hosting at $0:**
  - **Tier 1 (62 clips, ~20 MB) ships inside the app**, so follow-along works offline and costs no bandwidth.
  - **Tier 2 streams** from Supabase Storage (free plan: about 1 GB storage and 5 GB egress per month) and is cached on the device by expo-image after the first view.
  - **Cost trigger:** if streaming egress nears the free cap, move Tier 2 into the bundle in the next release or to a zero-egress CDN. This is the only line on this page that could ever cost money, and it only applies at real scale.
- **Code impact:** `ExerciseMedia` gains bundled-asset support (a generated `require()` map for Tier 1) next to URL loading, plus an `<AuraLayer state rank>` component behind the clip.

### 3.6 Pilot first, then scale
Before producing at volume, run **5 pilot exercises end to end**: push-up (Mixamo), bodyweight squat (Mixamo), plank (Mixamo, static hold), pull-up (video mocap) and glute bridge (video mocap). They must pass:
1. Coach form sign-off against the coach footage.
2. A seamless loop with no visible jump.
3. A ≤ 400 KB file that looks crisp on a 3× phone screen.
4. An aura that reads as anime power, keeps form fully visible, and holds 60 fps UI on a mid-range Android phone.
5. Five testers who identify the exercise correctly with the sound off.

The look gets locked only after all five pass. Changing the trainer or shader after 87 clips means re-rendering everything.

### 3.7 The real cost: time
| Phase | Estimate |
|---|---|
| Two trainer models in VRoid + Blender toon/outline setup + camera rig + props | 3–4 days |
| Batch render and encode script | 1 day |
| Per clip: motion source → clean-up → loop → render → review | ~30–60 min (Mixamo) · 1–2 h (mocap or hand-keyed) |
| Tier 1 (62 clips) | ~2–3 weeks part-time |
| Tier 2 (25 clips) | ~1–2 weeks part-time |
| Aura shader + states in the app | 2–3 days |

---

### 3.8 Coverage tiers (ship value early)
| Tier | What | Count | When |
|---|---|---|---|
| **1 — Launch** | Every Daily Quest, Penalty Quest, Rest Ritual and quick-session move + all program **main lifts** | 65 (generated in `exercise-media.json`) | Before soft launch |
| **2 — Complete** | The rest of the current library (accessories, mobility, alternatives) | 22 | Within 6 weeks after launch |
| **3 — Expansion** | New exercises (library grows toward 250) | Ongoing | Per season |

Until a clip exists, the app shows the **thumbnail + muscle map + numbered cues** (never an empty box), so nothing blocks the build.

### 3.9 Media manifest (data, not code)
`packages/content/src/data/exercise-media.json`, validated in CI:
```json
{
  "push-up": {
    "loop": "exercises/push-up/loop-front.webp",
    "side": "exercises/push-up/loop-side.webp",
    "thumb": "exercises/push-up/thumb.webp",
    "trainer": ["a", "b"],
    "cueMarks": [{ "at": 1.4, "cue": 1 }],
    "approvedBy": "coach-initials",
    "tier": 1
  }
}
```
Tier-1 clips and thumbnails ship inside the app bundle. Tier-2 clips live in Supabase Storage, download on first view and are cached with `expo-image`. The next exercise's loop is prefetched during rest (§3.5).

---

## 4. Follow-Along Trainer ("Train With Me")

The mode that turns the app from a logbook into a coach. Two variants share one player.

### 4.1 Timed follow-along (quests, HIIT, mobility, warm-ups, cool-downs)
```
┌──────────────────────────────┐
│  Round 2 / 3          ⏸  ✕  │  ← progress + controls
│                              │
│      [ trainer loop clip ]   │  ← full-bleed, mirrored for the right side
│                              │
│   ◯ 0:27   big timer ring    │  ← work = rank colour, rest = cyan
│   Mountain Climber           │
│   "Drive knees, hips level"  │  ← cue from the manifest
│ ───────────────────────────  │
│  Next: Burpee  [thumb]       │
│  ♥ 142  ·  12:40 left        │  ← metrics (HR if available), elapsed/remaining toggle
└──────────────────────────────┘
```
- **Voice coach** (pre-generated, §5 of ARCHITECTURE): "3, 2, 1, go" · "halfway" · "last 5 seconds" · one form cue per move · "rest, next up: burpees". Captions are on by default. Audio ducks under the user's music.
- **Haptics** on every transition. Screen stays awake. Lock-screen Live Activity shows move + time left.
- **Auto-advance**, with pause, skip and +15 s rest. XP counts only real active time (SYSTEMS.md §4.1).
- **Reduce Motion:** the loop becomes the thumbnail plus a numbered cue list.

### 4.2 Rep-based follow-along (strength sessions)
- The trainer loop sits at the top of each exercise card (16:9). Logging works as it does now (Sprint 3).
- The **rest screen previews the next exercise's loop** and plays its first cue, so you're ready before the timer ends.
- **Optional rep counter for quests:** tap the screen on each rep, or use the volume button; on-device camera pose detection is a Phase-3 research spike, not a promise.

### 4.3 Where follow-along appears
| Place | Mode | Notes |
|---|---|---|
| Daily Quest / Penalty Quest / Rest Ritual | Timed (reps quests use "work until target" with a big counter) | One "Follow along" button in each quest card |
| Quick sessions (Express, HIIT, Mobility, Core) | Timed | Already interval-based (Sprint 3); add the trainer + voice |
| **Guided warm-up** before every program workout | Timed, 5 min | Generated from the day's focus (§5) |
| **Guided cool-down** after every program workout | Timed, 3 min | Generated from the muscles trained |
| Program session player | Rep-based | Loop on each exercise card and on the rest screen |
| Rank Trials | Timed for plank / 60 s squats | The trainer demonstrates the **form standard** before each event |
| Signature Gates (§6.4) | Timed, for time | Hero intro and outro cinematics |

---

## 5. Guided Warm-ups & Cool-downs (Real-Coach Standard)

Every program workout gets a generated 5-minute warm-up and a 3-minute cool-down (PLAN.md §5.7):

| Day focus | Warm-up (≈ 5 min) | Cool-down (≈ 3 min) |
|---|---|---|
| **Upper** | Jumping jacks 45 s · Cat-cow 45 s · Band pull-aparts or arm circles 45 s · Thoracic open book 45 s/side · Push-up to downward dog 45 s, **then ramp sets** on the first lift | Child's pose 45 s · Open book 30 s/side · Doorway chest stretch 30 s |
| **Lower** | High knees or march 45 s · World's greatest stretch 45 s/side · Bodyweight squats 45 s · Glute bridges 45 s · Hip flexor stretch 30 s/side, **then ramp sets** | 90/90 hip switch 45 s · Hip flexor stretch 30 s/side · Deep squat hold 30 s |
| **Full body** | Jumping jacks 45 s · World's greatest stretch 45 s/side · Squats 45 s · Push-up to downward dog 45 s · Glute bridges 45 s | Child's pose 45 s · 90/90 45 s · Downward dog 30 s |

Warm-up and cool-down content lives in `@lb/content/flows.json`. Injuries swap moves the same way the generator does. A short warm-up is skippable but encouraged ("Warm-ups cut injury risk; the System notices.").

---

## 6. Naming System (Professional First)

### 6.1 Exercises: real names only
- Standard English gym/coaching names ("Bulgarian Split Squat", "Romanian Deadlift"). They're searchable, recognisable to coaches and safe to look up elsewhere.
- **Never** rename an exercise with an anime name. Flavour appears around it ("Gate cleared", "Limit broken"), not instead of it.
- Skill-tree milestones may grant a **title** (e.g. reaching archer push-ups earns *"Bowstring"*), but the exercise keeps its real name.

### 6.2 Workouts inside programs
Format: **descriptive name** + small **Gate code** label.
- "Upper Body · Pull Focus" with the label **Gate C-12** (rank tier letter + sequence).
- The Gate code is the flavour layer: it appears in the session header, the debrief and the share card.

### 6.3 Programs
Brand name + plain subtitle, as now: **Shinobi Path**, *Calisthenics · 4 days · Novice–Intermediate*.

### 6.4 Signature Gates (fixed benchmark workouts)
Like Freeletics' fixed named workouts and CrossFit's benchmarks: **the same workout for everyone, done for time**, so you can measure progress and compare fairly. Each has an **original** anime-lore name, a rank tier, a "Scaled" version and a monthly leaderboard (SYSTEMS.md §5).

| Gate | Tier | Workout (for time unless stated) | Scaled version |
|---|---|---|---|
| **Ember** | E | 3 rounds: 10 squats · 10 push-ups · 20 s plank | Knee push-ups |
| **Gale** | E–D | 4 rounds: 15 squats · 10 reverse lunges/leg · 30 s mountain climbers | 3 rounds |
| **Iron Oath** | D | 50-40-30-20-10 squats with 25-20-15-10-5 push-ups | Halve reps |
| **Tempest** | D–C | 21-15-9 burpees and jump squats | Squat thrusts instead of burpees |
| **Shadow Step** | C (Ranger) | 2.4 km run, then 50 burpees | 1.6 km + 30 burpees |
| **Crimson Moon** | C–B | EMOM 12 min: odd minutes 10 push-ups + 10 squats, even minutes 30 s plank | Knee push-ups |
| **Thousand Cuts** | B | 100 push-ups · 200 squats · 5 min of plank total, partitioned any way you like | 50 · 100 · 3 min |
| **Skybreaker Ascent** | A | 10 rounds: 5 pull-ups · 10 push-ups · 15 squats | Band-assisted pull-ups / rows |
| **Sovereign** | S | 3 rounds: 400 m run · 21 burpees · 12 pistol squats (6/leg) · 9 pull-ups | Split squats, assisted pull-ups |

All content is original (names, lore, artwork). Gates follow the equipment and injury rules (home versions need nothing or a pull-up bar).

---

## 7. Avatar Forge (Build Your Hunter with Earned Points)

Answers "build the avatar on points": your hunter's look is **earned by training**, not bought with progress.

### 7.1 Two kinds of points (kept separate)
| Currency | Earned from | Spent on |
|---|---|---|
| **Ability Points (AP)** | Levelling up (existing) | Skill Tree: training progressions (unchanged) |
| **Essence** (new, cosmetic) | Daily Quest 5 · Penalty cleared 5 · Program workout 10 · Weekly boss 40 · Streak milestones 7/30/100/365 → 25/100/300/1,000 · Rank Trial pass 100 · Signature Gate personal best 20 · Monthly board Top 100 → 150 | **Avatar Forge** items |

- Essence **never** buys XP, stats, rank or training advantages. Premium may later add exclusive cosmetic sets, but everything earnable stays earnable for free users.
- Daily Essence is capped (e.g. 60/day) and paid out through the same idempotent event pipeline as XP.

### 7.2 What you can forge
| Slot | Examples | Unlock rule |
|---|---|---|
| Base (free at onboarding) | Body type, skin tone, face, eyes, hair style and colour | Free, changeable anytime |
| Outfit | Training gear, coats, hakama, techwear | Essence; some **rank-locked** (C+ outfits need C-Rank) |
| Accessory | Headbands, scarves, gloves, earrings | Essence |
| Aura | Glow colour/particles behind the hunter | Rank-locked base aura (E grey → S gold) + Essence variants |
| Weapon / prop (shown in poses) | Practice sword, staff, bow, gauntlets per class | Class + rank-locked |
| Frame & title | Profile frame, title under your name | Achievements, boards, bosses |

**Rank evolution stays automatic:** each rank promotion upgrades posture and aura for free (PLAN.md §2.8). The Forge is personal style *on top of* that.

### 7.3 How it's built (cheap and fast)
- **Layered 2D avatar.** Render each part from the VRoid model in the same 3/4 pose as transparent PNG layers (base, hair back, body, outfit, accessory, hair front, aura). Composite them in the app with Skia. The file sizes are tiny and it works offline.
- **Idle life:** a Rive (or Skia) rig over the layers for breathing, blinking and cloth sway, plus 3 reactions (cheer, determined, tired).
- **Everywhere:** hero card, profile, Hunter License share card, community posts (small avatar), and the **Shadow-Self boss** (your current avatar rendered as a dark silhouette with red eyes).
- **Data:** `cosmetics` (id, slot, rarity, price, rankLock, classLock, layerKeys) in content; `inventory` and `loadout` per user in the DB.

---

## 8. Screens Affected

| Screen | Change |
|---|---|
| Session player | Demo loop on each exercise card, angle toggle, muscle chips → muscle map; rest screen previews the next loop |
| Exercise detail | Loop (front/side), muscle map, cues synced to cue marks |
| Workout preview | Thumbnails per exercise, a "Muscles worked" map for the whole session, guided warm-up/cool-down rows |
| Quests | "Follow along" button on Daily, Penalty and Rest Ritual |
| Train tab | **Signature Gates** row with hero cover art and your personal best |
| Profile | Weekly muscle-volume map; **Avatar Forge** entry; Essence balance |
| Home | Hunter card shows the composed avatar (replacing the sigil once art exists; the sigil remains the fallback) |

---

## 9. Build Order

| Step | Engineering (can start now with placeholders) | Content production (parallel) |
|---|---|---|
| **V1** ✅ | Muscle-map component · media manifest + Zod schema · `ExerciseMedia` component (loop → thumbnail → cues fallback) · prefetch and cache | Lock both demo-trainer models; render 5 test exercises; coach sign-off on the look |
| **V2** ✅ (Live Activity + next-loop prefetch pending media) | Follow-along player (timed + rep-based), voice-cue scheduler with captions, Live Activity hook, guided warm-up/cool-down flows | Tier 1 clips (65) via Mixamo + coach mocap; record voice lines |
| **V2.5** ✅ engineering | `<AuraLayer>` Skia shader with 7 states (E spirit-blue → S gold, 30 fps, opacity cap, static under Reduce Motion) · bundled Tier-1 map (`media:bundle`, budget-checked) in `ExerciseMedia` · `tools/render` Blender batch render + libwebp encoder · dev-only `/dev/aura` lab | **Pilot of 5 exercises (§3.6)** → lock the look → Tier 1 production |
| **V3** | Signature Gates (content, timer for time, personal bests, boards) | Hero cover art for 9 Gates |
| **V4** | Avatar Forge: Essence ledger, cosmetics content, inventory/loadout, layered avatar renderer, Shadow-Self silhouette | Base parts + first 40 cosmetic items, rendered as layers |
| **V5** | Tier 2 clips land; weekly muscle-volume map on Profile | Tier 2 (22) clips |

V1–V2 come before launch, because demos are a launch requirement for a real fitness app. V3–V5 can follow soon after.

---

## 10. Quality Bar (Definition of Done for Visuals)
- [ ] Every launch-tier exercise has a coach-approved loop, thumbnail and muscle map
- [ ] No screen ever shows an empty media box (fallback chain works offline)
- [ ] Follow-along works with the screen locked (audio + Live Activity) and with Reduce Motion on
- [ ] Captions for every voice cue; all controls labelled for screen readers
- [ ] Media budget: each loop ≤ 400 KB; Tier 1 in-app ≤ 25 MB; Tier 2 streamed and cached
- [ ] Aura never covers the body; static glow under Reduce Motion; 60 fps UI on a mid-range Android phone
- [ ] Licence log: every clip records its motion source (Mixamo, mocap or hand-keyed) and the coach who approved it
- [ ] Original IP only: no likeness of existing anime characters in trainers, heroes, Gate art or cosmetics

---

### Research sources
- Nike Training Club video-led sessions: [Planfit review](https://planfit.ai/blog/best-workout-app), [Garage Gym Reviews](https://www.garagegymreviews.com/best-workout-apps)
- Apple Fitness+ on-screen metrics and time display: [Apple Support](https://support.apple.com/guide/fitness-plus/apdf8a229f34/ios), [Apple Newsroom](https://www.apple.com/bh/newsroom/2020/09/apple-fitness-plus-a-personalized-fitness-experience-comes-to-life-with-apple-watch), [WhistleOut review](https://www.whistleout.com/CellPhones/Apps/apple-fitness-plus-app-review)
- Freeletics fixed named workouts: [Freeletics: the Gods](https://www.freeletics.com/en/blog/posts/the-freeletics-gods/), [Freeletics: Hades](https://www.freeletics.com/en/blog/posts/every-workout-has-its-story-hades)
- Exercise animation and illustration licensing options: [MoveKit (AlternativeTo)](https://alternativeto.net/software/movekit/about/), [Muscle & Motion pricing](https://muscleandmotion.com/pricing), [WorkoutLabs licensing](https://workoutlabs.com/exercise-illustrations-licensing/), [ExerciseDB dataset](https://exercisedb.gumroad.com/l/exercisedb)
- Trainer pipeline licences and status (Nov 2026): [Mixamo FAQ (Adobe)](https://helpx.adobe.com/be_en/creative-cloud/faq/mixamo-faq.html), [Mixamo licensing thread](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775), [VRoid Studio guidelines](https://vroid.com/en/studio/guidelines), [Rokoko pricing](https://rokoko.com/pricing/), [FreeMoCap (PyPI)](https://pypi.org/project/freemocap), [Ready Player Me shutdown (TechCrunch)](https://techcrunch.com/2025/12/19/netflix-acquires-gaming-avatar-maker-ready-player-me/)
