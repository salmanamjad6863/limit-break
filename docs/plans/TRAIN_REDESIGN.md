# Train Redesign: Plan

Goal: make the Train experience worth paying for. Programs that take a hunter from **Beginner to Pro**, workouts that can be **changed on the spot**, personalised by **gender (male / female) and age**, in a layout that feels as polished as the best fitness apps. Exercise media uses **placeholders now**; a licensed clip provider is plugged in later without layout changes.

---

## 1. Review: what we have today

| Area | Today | Problem |
|---|---|---|
| Train tab | Program name + "Day 1 of 6", an "In progress" card, a 7-row text week list, 4 quick sessions, recent list, library link | All text. No imagery, no muscles, no exercise preview. Three of the seven week rows say "Missed", which reads as failure. Nothing invites you to start |
| Workout preview | Exists (`app/workout/preview.tsx`), but is reached only from the in-progress card | Not the main path; the user can't see a day's exercises before starting |
| Player | One exercise at a time: big media card, one set editor, Prev / Next | Can't see the whole workout or all sets at once (Hevy/Strong-style table). The timer showed **1121:49** on a stale session. Load shows "—" with no suggestion |
| Programs | 11 programs, each tagged with levels (beginner/novice/intermediate/advanced), location and goal | No level ladder inside a program, so going from beginner to pro means switching programs. No "Pro" tier. Few home and female-focused options |
| Changing on the spot | Swap exercise, "This hurts", settings screen for days/time/equipment | No one-tap **mode** change (easier/harder, home/gym, shorter) for today |
| Personalisation | `sex` ∈ male / female / **unspecified**; age only used for heart-rate zones and nutrition | The workout generator ignores sex and age. "Other" can't feed strength standards, starting loads or the right trainer model |
| Quick sessions | 4 (7-min express, 15-min HIIT, 10-min mobility, 12-min core) | Too few; no focused workouts like "Home Abs" or "Dumbbell Chest" (what your examples sell) |

## 2. What the best apps do (from your examples + industry patterns)

- **ProFit / Gym Workout Fitness:** a week strip (MON TUE WED …) with an image per day. Each day is a list of exercise rows: **thumbnail · name · sets × reps · small muscle figure**. A "Description" chip, and an age-band picker in onboarding (18–29, 30–39, 40–49, 50+).
- **Muscle Monster posters:** focused workouts ("6 Dumbbell Moves, Chest", "Home Abs, 9 exercises") with a cover, a target-muscle highlight per exercise, and sets × reps on every card.
- **Hevy / Strong (logging):** the session is a **table**: SET · PREVIOUS · KG · REPS · ✓. Rest timer starts on ✓, warm-up sets are flagged, and adding sets or exercises is one tap.
- **Fitbod / Freeletics (adaptivity):** today's workout regenerates instantly when time, equipment or intensity changes, and recovery is shown per muscle.
- **Nike Training Club (guided):** full-screen guided mode with a big demo, a countdown, "next up" and voice cues.
- **"You" analytics** (your 2nd screenshot): a muscle-split radar, volume per muscle and a workout log. We already have most of this data.

## 3. The new structure

### 3.1 Train tab (home of training)
1. **Program hero card:** cover art, program name, **level chip** (Beginner → Pro), "Week 2 of 6", and a progress ring. Tapping opens Program detail.
2. **Week strip:** seven day chips (Mon–Sun). Each chip has a mini muscle icon for its focus, a ✓ when done, a ● for today, a moon for rest, and a soft "moved" mark instead of "Missed". Tapping a day previews that day.
3. **Today card (the main action):**
   - Title, target muscles (mini front/back map), duration, exercise count and est. kcal.
   - **Mode bar** (change on the spot): **Intensity** Light · Standard · Intense, **Where** Home · Gym, **Time** 20 · 30 · 45 · 60 min. Changing any of them regenerates today's workout instantly (§4.3).
   - The **exercise list**: thumbnail (placeholder for now) · name · `4 × 8–12` · muscle tag.
   - **Start** button (and **Resume** when a workout is in progress).
4. **Focused workouts:** horizontal shelves like your examples: "Home Abs", "Dumbbell Chest", "Glutes", "Arms", "Full Body 20′", "Mobility", "HIIT". Poster cards show the exercise count and duration.
5. **Programs:** browse by goal, level and location, as cover cards.
6. **Your training:** streak, muscles trained this week (heat map), and a link to history and the exercise library.

### 3.2 Workout preview
- A hero area with the demo of the first exercise (placeholder) and a **muscles-worked** front/back map.
- Equipment needed, duration and difficulty.
- The exercise list. Rows can be swapped, reordered or removed, and the mode bar is repeated here.
- **Start**.

### 3.3 Player: two modes, one session
- **Guided mode** (default for Beginner/Novice): one exercise per screen, with a big demo, the set target, a countdown or rep counter, a full-screen rest timer with **"Next up"**, and voice cues. This is what we have now, polished.
- **Log mode** (default for Intermediate+): every exercise as a card with a **set table** (SET · PREVIOUS · KG · REPS · RIR · ✓). There's a suggested load in grey, warm-up rows, and add-set / add-exercise. The rest timer starts on ✓.
- One toggle switches between the modes mid-workout. Both use the same session store.
- **Fixes:**
  - A session older than 6 h asks "Finish or discard?" instead of showing a 1121-minute timer.
  - Suggested load appears from the first set (from e1RM, or from strength standards when there's no history; §4.2).

### 3.4 Program detail
- Cover, level, weeks, days per week, location, and "who it's for".
- A week-by-week outline that lists every day's exercises.
- "Start this program" and "Change level".

## 4. Training engine changes

### 4.1 Level ladder: Beginner → Novice → Intermediate → Advanced → **Pro**
- Add `pro` to `Experience` (contracts + engine). Today `advanced` is the top level.
- A program becomes **one template with level variants**. The same days get different parameters:

| Level | Sets per main lift | Reps / RIR | Exercise complexity | Rest | Weekly volume / muscle |
|---|---|---|---|---|---|
| Beginner | 2–3 | 8–12 @ RIR 3 | machines, bodyweight, simple free weights | 90 s | 6–8 sets |
| Novice | 3 | 6–10 @ RIR 2–3 | + barbell basics | 90–120 s | 8–10 |
| Intermediate | 3–4 | 5–10 @ RIR 2 | + unilateral, supersets | 2 min | 10–14 |
| Advanced | 4–5 | 3–8 @ RIR 1–2 | + top sets, back-offs | 2–3 min | 14–18 |
| Pro | 4–6 | 1–6 @ RIR 0–1 | + intensity techniques, periodised blocks | 3 min | 16–20 |

- **Promotion:** the app suggests the next level when adherence is ≥ 80% over 4 weeks, main lifts have progressed and strength standards are met (§4.2). The hunter can change level at any time; a demotion is always one tap.
- The level ties into ranks: E–D ≈ Beginner/Novice, C–B ≈ Intermediate/Advanced, A–S ≈ Pro (shown as a hint, never forced).

### 4.2 Gender and age (male / female only)
- **Gender:**
  - Remove "Other" from onboarding. Existing `unspecified` profiles are asked once, on next launch, to choose (the DB enum keeps the value for old rows).
  - Uses:
    - Strength standards (bodyweight multiples per lift), which give the level estimate and starting loads.
    - Calorie and BMR maths (already used).
    - The trainer figure (male or female clip when the provider has both).
    - Default program *suggestions*. All programs stay open to everyone; this only changes what's suggested first.
- **Age bands: 18–29 · 30–39 · 40–49 · 50+** (computed from birth date; 13–17 keeps the existing minor protections).
  - **40–49:** longer warm-up, +1 rest day of recovery bias, conservative RIR (+1) for heavy compounds.
  - **50+:** joint-friendly swaps (low-impact cardio instead of jumps, machines/DB before barbell for beginners), deload every 4 weeks, balance and mobility finishers.
  - Every band: progression rate is scaled (faster for younger novices, steadier for 50+).
- The same rules run in the server generator (authoritative) and in demo mode, as one engine function.

### 4.3 Change on the spot: the mode bar
`generateWorkout(day, profile, { intensity, location, minutes })`, all in the engine (most rules already exist):
- **Intensity Light / Standard / Intense** sets the sets (−1 / 0 / +1), RIR (+1 / 0 / −1) and rest. Intense may add a finisher.
- **Home / Gym** swaps equipment by movement pattern. This already exists as equipment fallbacks.
- **Time 20 / 30 / 45 / 60** trims accessories first, then sets. This already exists as time-squeeze.

The change applies to today only, and the session records which mode was used. XP stays fair because it's per effort (same rules).

### 4.4 Content
- **Programs:** grow from 11 to about 20, covering gym and home for each goal, female-popular splits (glutes/lower focus, full-body toning) and a Pro block (periodised strength). Each has level variants.
- **Focused workouts:** grow from 4 to about 30, each with a poster, e.g. Home Abs, Dumbbell Chest, Arms, Glutes, Legs, Back, Shoulders, Full Body 20′, HIIT, Mobility and Stretch, all at 2–3 levels.
- **Exercises:** 87 → ~150 once the media provider is chosen (match their catalogue so every exercise has a clip).

## 5. Media: placeholders now, provider later
- One `ExerciseMedia` component with one rule: **licensed clip → our animated trainer → placeholder poster**. Layouts are designed around a **16:9 demo box and a 1:1 thumbnail**, so a provider's clips drop in without layout changes.
- **Placeholder poster:** a dark card with a muscle-map highlight, exercise name and equipment icon. Consistent and clean, not "missing".
- A **provider adapter**: an `exerciseId → provider clip id` table, CDN URL builder, prefetch of the next exercise and offline cache. Swapping provider (ymove / WorkoutX / ExerciseDB / MoveKit) is a config change.
- Remove the experimental clips from `apps/mobile/assets/exercises/` (photo and 3D) before shipping, per your decision to use a provider.

## 6. Smoothness bar
- FlashList for long lists. Skeletons instead of spinners. Shared-element transitions (card → preview → player) with Reanimated. Haptics on ✓ and rest end.
- 60 fps on a mid-range Android. Images through expo-image with caching. Next-exercise media prefetched. Everything works offline.
- Dynamic Type, VoiceOver labels on every control, and 44 pt touch targets.

## 7. Build order (each phase ships on its own)
1. ✅ **Engine + data:** `pro` level, level variants, mode bar parameters, gender/age rules and tests. Migrate `unspecified` (prompt once). Built in `packages/engine/src/training/personalize.ts` (`personalizeWorkout`, `adaptDay`, `standardE1rm`, `suggestLevelUp`), tests in `packages/engine/test/personalize.test.ts`. The app's `useToday` uses it; today's mode is stored per game day (`useTraining().setMode`). Onboarding is male/female only; old "Other" profiles get a one-time Home card.
2. ✅ **Train tab:** hero, week strip, Today card with the mode bar and exercise list, focused-workout shelves, placeholder posters. Built in `apps/mobile/src/app/(tabs)/train.tsx` with blocks in `src/features/training/TrainCards.tsx`; placeholder thumbs are a single-figure muscle map + equipment badge in `ExerciseMedia` (`MuscleMap side=`), so a provider's 1:1 thumbs replace them with no layout change.
3. ✅ **Preview + Program detail:** muscles map, editable list, level change. Preview (`app/workout/preview.tsx`): demo hero, muscles + kit, mode bar, swap / reorder / remove with reset; edits are `WorkoutEdits` keyed by template slot (`personalizeWorkout(..., edits)`), stored per game day + program day. Program detail (`app/program/[id].tsx`): who it's for, level ladder with one-tap "Set my level", week tabs with age-adjusted deloads, every day personalised at the chosen level. The Programs list, hero and posters open it.
4. ✅ **Player:** Log mode table, Guided polish, stale-session fix, suggested loads. Log mode is `features/training/LogView.tsx` (SET · PREVIOUS · KG · REPS · RIR · ✓, suggestions as grey placeholders, Add set, rest bar in the footer); a Guided/Log switch sits in the player header and defaults by level. Sessions untouched for 6 h show "Unfinished workout" (`staleSession`, `StaleSessionCard`): save as of the last set, or discard. Swaps keep a suggested load (`startingLoad`). Not done: adding a new exercise mid-workout.
5. ✅ **Content:** about 20 programs and about 30 focused workouts, level-tagged. 20 programs (+9: Home Hypertrophy, Glute Sculpt at Home, Full-Body Tone, Pro Strength Block, Classic 5-Day Split, Bodyweight Mastery, Lean & Strong, Strong at 50+, Athletic Power) and 27 focused workouts in `packages/content/src/data/focused-workouts.json` (abs, chest, back, shoulders, arms, glutes, legs, full body, HIIT, mobility; home and gym), plus the 4 interval sessions. Focused workouts run through the same engine (`buildFocused`), open in the preview (`/workout/preview?focused=id`) and are logged as one-off sessions that don't move the program. Content tests check every program day and focused workout fills at every listed level for no-kit, home-kit and gym users. New programs are premium (the free list is unchanged).
6. **Provider hookup** (after you subscribe): adapter, mapping, prefetch and cache.

## 8. Decisions for you
1. **Level names:** Beginner · Novice · Intermediate · Advanced · Pro (or E–S rank names in the UI?).
2. **Default player mode by level:** Guided for Beginner/Novice, Log for the rest (both switchable)?
3. **Existing "Other" users:** ask once on next launch (recommended), or default from the nutrition profile?
