# LIMITBREAK — Systems & Formulas Spec (Final)

> The **single source of truth for every formula and rule** in the app. Everything here is implemented in `packages/engine` (pure TypeScript), unit-tested with the worked examples in this doc, and runs identically on the phone (preview) and the API (authoritative).
>
> Document set:
> - [PLAN.md](PLAN.md): product and game design
> - [ARCHITECTURE.md](ARCHITECTURE.md): stack, repo and build order
> - **SYSTEMS.md** (this file): formulas, logic, community, subscriptions
>
> Where formulas differ, this file wins.

**Conventions:** metric units internally (kg, cm, kcal, ml, seconds). Convert at the UI edge only. Every tunable number is a named constant in `engine/src/constants.ts`, never a magic number in code.

---

## 0. Global Rules

| Rule | Definition |
|---|---|
| **Game day** | Each user's day runs in their own timezone and **rolls over at 03:00**, not midnight, so a late-night session still counts for "today". Every row stores `localDate` at write time. |
| **Idempotency** | Every event has a client-generated UUID. The server upserts by id, so retries never double-count. |
| **Server authority** | XP, stats, ranks, streaks and TDEE are computed on the server from the event log. The app shows a preview from the same engine. |
| **Recompute, don't patch** | Derived values (stats, TDEE, weekly totals) are recomputed from source rows by deterministic functions, so a bug fix plus a re-run repairs history. |
| **Rounding** | Store full precision. Round only for display: kcal to 10, grams to 1, kg to 0.1. |

---

## 1. Body Metrics

### 1.1 Unit conversions (exact)
```
1 lb = 0.45359237 kg        1 in = 2.54 cm         1 oz = 28.349523 g
1 fl oz (US) = 29.5735 ml   1 cup (US) = 236.6 ml  1 tbsp = 14.79 ml   1 tsp = 4.93 ml
ml → g: grams = ml × density (food.density, default 1.0 g/ml)
```

### 1.2 BMI and reference weight (for protein)
```
BMI = weight_kg / (height_m²)
referenceWeight =
  if bodyFat% known       → use lean body mass rules (§2.4)
  else if BMI ≥ 30        → 25 × height_m²      // weight at BMI 25 (stops oversized protein targets)
  else                    → weight_kg
```

### 1.3 Body fat estimate (optional, US Navy method; inputs in inches)
```
Male:   BF% = 86.010 × log10(waist − neck) − 70.041 × log10(height) + 36.76
Female: BF% = 163.205 × log10(waist + hip − neck) − 97.684 × log10(height) − 78.387
LBM_kg = weight_kg × (1 − BF%/100)
```
Shown as an *estimate* with a ±3–4% note. A user-entered BF% (DEXA, scale) overrides it.

### 1.4 Weight trend (removes daily water noise)
Exponential moving average with gap-aware smoothing:
```
α = 0.10 per day
On a new weigh-in w_t after g days since the last one:
  α_eff   = 1 − (1 − α)^g                 // a 3-day gap → α_eff ≈ 0.271
  trend_t = trend_prev + α_eff × (w_t − trend_prev)
Initialization: trend_0 = mean(first 3 weigh-ins) (or the first one if fewer)
Multiple weigh-ins in one day → use the earliest (morning) one.
Outlier guard: if |w_t − trend_prev| > max(2.0 kg, 2.5% × trend_prev)
  → ask "Is this right?"; if confirmed, use α_eff × 0.5 for this point.
```
**Rate of change** (used by TDEE and check-ins): the OLS (least-squares) slope of *raw* weigh-ins over the window, in kg/day. This uses every point and is robust to a single bad endpoint. It needs at least 5 weigh-ins spread over at least 10 days.

---

## 2. Nutrition Engine ("Mana")

### 2.1 BMR
```
If LBM known (BF% given):   BMR = 370 + 21.6 × LBM_kg                       (Katch-McArdle)
Else male:                  BMR = 10W + 6.25H − 5A + 5                       (Mifflin-St Jeor)
Else female:                BMR = 10W + 6.25H − 5A − 161
Else (not specified):       BMR = 10W + 6.25H − 5A − 78                      (midpoint)
W = kg, H = cm, A = years
```

### 2.2 Starting TDEE (the prior, used until real data exists)
Daily movement and planned exercise are counted **separately** to avoid the classic double-count:
```
lifestyleFactor  (from onboarding: job + typical steps)
  sedentary  (< 5k steps)   1.20
  light      (5–8k)         1.30
  active     (8–12k)        1.40
  very active (> 12k)       1.50

exerciseKcalPerDay = Σ_planned_sessions_per_week ( (MET − 1) × W × hours ) / 7
  MET: strength 5.0 · calisthenics circuit 6.0 · running ≈ speed_kmh × 1.0 · cycling moderate 7.0
  (MET − 1 = net of resting energy, already inside BMR)

TDEE_prior = BMR × lifestyleFactor + exerciseKcalPerDay
```

### 2.3 Adaptive TDEE (the core, recomputed nightly and after each weigh-in)
```
Window: the last N = 21 days (minimum usable: 10 days)
validDay = the user marked the day "complete", OR (≥ 2 meals logged AND kcal ≥ 60% of target)

meanIntake = mean(kcal on valid days in window)
slope      = OLS slope of raw weight over window (kg/day)       // §1.4
ρ          = 7,700 kcal per kg                                   // energy density of weight change

TDEE_obs   = meanIntake − ρ × slope          // losing weight → slope < 0 → TDEE above intake

Confidence c ∈ [0,1]:
  c = min(1, validDays / 14) × min(1, weighIns / 7)

Recursive update (once per game day):
  TDEE_t = TDEE_{t−1} + 0.10 × c × (TDEE_obs − TDEE_{t−1})
  TDEE_0 = TDEE_prior
  clamp: BMR × 1.05 ≤ TDEE_t ≤ BMR × 2.5
```
**Why this is robust**
- Low data (c≈0) means the estimate stays near the prior. Full data moves it about 10%/day toward what's observed (≈10-day time constant), so one weird week can't swing it.
- If ρ is a bit off (lean vs fat tissue), the bias is self-correcting: targets are set to hit the **observed** rate, so the control loop absorbs it.
- **Never "eat back" exercise calories.** Adaptive TDEE already includes your real activity. Watch/Health "active calories" are shown for information only and are never added to the budget.

**Edge cases**
- A day logged as complete with < 800 kcal → ask "Was this a full day?" before it counts.
- Fewer than 10 days of data → show "Calibrating… day X/14" and use the prior.
- Goal or diet-phase switch → TDEE carries over (it's a property of the body, not the goal).

### 2.4 Calorie target
```
Goal rate r (in % bodyweight per week):
  Cut:      −0.25 · −0.50 (default) · −0.75 · −1.00 (max; only offered if BMI ≥ 25)
  Maintain: 0
  Recomp:   0 kcal, protein high, training emphasized
  Bulk:     +0.10 (default lean) · +0.25 · +0.50 (beginners only)

rateKgPerWeek = r × trendWeight
delta        = rateKgPerWeek × ρ / 7
kcalTarget   = TDEE_t + delta

Safety rails (applied in order):
  1. Deficit cap:   delta ≥ −min(0.25 × TDEE_t, 1000)
  2. Floor:         kcalTarget ≥ max(BMR, floorBySex)    floorBySex: F 1200 · M 1500 · unspecified 1350
  3. Under 18:      delta ≥ 0 (maintain/recomp/bulk only)
  4. Weekly smoothing: |kcalTarget − lastWeekTarget| ≤ 150, unless the user just changed the goal
```

### 2.5 Macro split
```
Protein (g):
  if LBM known:  cut 2.4 × LBM · maintain/recomp 2.2 × LBM · bulk 2.0 × LBM
  else:          cut 2.0 × refW · maintain/recomp 1.8 × refW · bulk 1.6 × refW
  hard minimum 1.6 × refW; if protein kcal > 40% of kcalTarget → cap at 40% (but never < 1.6 × refW)

Fat (g):
  pct by preference: lower-fat 0.20 · balanced 0.30 (default) · higher-fat 0.40
  fat = max(0.6 × weight_kg, pct × kcalTarget / 9)

Carbs (g):
  carbs = (kcalTarget − 4·protein − 9·fat) / 4
  if carbs < 50 and diet ≠ keto → lower fat toward its 0.6 g/kg floor, then recompute

Fiber (g):   14 × kcalTarget / 1000
Water (ml):  35 × weight_kg + 500 per training hour        (shown as a guide, not a hard rule)
Alcohol:     7 kcal/g, counts toward kcal only, never toward macros
```
Users can override any macro manually. The engine then fills the remaining kcal from carbs.

### 2.6 Worked example (unit-test fixture)
> Male, 25 y, 178 cm, 80 kg, no BF%, light lifestyle, 4 × 60-min strength sessions/week, goal: cut −0.5%/week, balanced fat.
```
BMR            = 10·80 + 6.25·178 − 5·25 + 5          = 1,792.5
exercise/day   = 4 × (5 − 1) × 80 × 1 / 7             = 182.9
TDEE_prior     = 1,792.5 × 1.30 + 182.9               = 2,513
delta          = (−0.005 × 80) × 7,700 / 7            = −440   (cap 628 OK)
kcalTarget     = 2,073 → floor max(1,792.5, 1,500) OK  → 2,073
protein        = 2.0 × 80                             = 160 g  (640 kcal = 31% OK)
fat            = max(48, 0.30 × 2,073 / 9 = 69.1)     = 69 g
carbs          = (2,073 − 640 − 621) / 4              = 203 g
fiber          = 29 g    water ≈ 2.8 L + 0.5 L on training days

Three weeks later: mean intake 2,100, slope −0.05 kg/day
TDEE_obs = 2,100 + 7,700 × 0.05 = 2,485   → the estimate converges toward 2,485
```

### 2.7 Food math
```
nutrient(log) = food.per100g[nutrient] × grams / 100
grams         = servings × serving.grams       (or ml × density)
Label check:  kcalFromMacros = 4P + 4C + 9F + 7·alcohol
              if |label kcal − kcalFromMacros| / label kcal > 0.15 → flag "data looks off", prefer label kcal

Recipe per serving = Σ ingredient nutrients / servings
Recipe by cooked weight: per100g_cooked = Σ ingredient nutrients / cookedWeight_g × 100
```

**Search ranking** (unified search across your history, curated, USDA, Open Food Facts):
```
score = 0.45 × textMatch (trigram similarity, prefix boost)
      + 0.25 × personalFrequency (log-scaled count of past logs)
      + 0.15 × verified (0/1)
      + 0.10 × globalPopularity (log-scaled)
      + 0.05 × recency (decays with days since you last logged it)
```

**AI photo logging:** the model returns `[{ name, grams, gramsLow, gramsHigh, confidence, matchedFoodId? }]`. Items with confidence < 0.6 are shown highlighted for the user to confirm. Nothing is saved until the user taps Confirm. The estimate range is shown on the slider.

### 2.8 Adherence and Mana (gamified layer)
```
proteinAdherence(day) = min(1, proteinEaten / proteinTarget)
proteinHit(day)       = proteinAdherence ≥ 0.90
kcalOnTarget(day)     = |kcalEaten − kcalTarget| ≤ max(150, 0.10 × kcalTarget)
Mana bar (%)          = proteinAdherence × 100
HP bar                = kcal remaining (display only; no XP attached)
```
**Safety rules (hard-coded, not tunable):**
- No XP or reward for eating less than the target.
- Three of the last 7 days below max(1,000, 0.5 × BMR) triggers a supportive check-in plus a resources link, and pauses deficit increases.
- "Protein-only mode" and "hide calories" are available at any time.

### 2.9 Weekly check-in ("System Debrief", every 7 days on the user's chosen day)
```
if validDays(last 7) < 4 → "Not enough data, targets unchanged." (no shaming)
else:
  observedRate = slope(last 14 days) × 7     (kg/week)
  recompute kcalTarget from the current TDEE_t (§2.4, including the ±150 smoothing)
  message = template(goal, observedRate vs goalRate, adherence) → optional AI rewrite in the System voice
```

### 2.10 Food data and the diary (real, $0 data sources)
| Source | What it gives | Cost and terms |
|---|---|---|
| **USDA FoodData Central** (Foundation + SR Legacy) | Accurate whole foods (rice, chicken breast, eggs, oats…) | Free API key; data is public domain. Cache every food we use in our own DB |
| **Open Food Facts** | Barcoded packaged foods worldwide | Free; ODbL: show attribution, and changes to *their* data stay open |
| **Curated LIMITBREAK foods** | Common home-cooked and regional dishes the big databases cover badly (rice and curry plates, roti/flatbreads, lentil dishes, wraps, shakes) with real portion presets (1 roti, 1 cup cooked rice, 1 plate) | Our own data, coach-reviewed; values sourced from USDA ingredients via the recipe math (§2.7) |
| **Your foods** | Custom foods, recipes (by serving or cooked weight), favourites and history | Yours; private by default |

**Diary features (must-have for launch):**
- Meals: breakfast · lunch · dinner · snacks (renamable), each with a time.
- Add by search (ranked as in §2.7), **barcode scan** (expo-camera, on device), recent/favourites, **quick add** (kcal + macros) and **copy a meal or a whole day**.
- Portions in grams, servings or household units, with a live macro preview before saving.
- Top of the screen: kcal remaining ring, then **Protein (Mana) first**, carbs, fat, fiber; per-meal totals; water tracker.
- Weigh-ins (trend line, §1.4) feed the **adaptive TDEE** (§2.3) nightly and the **weekly check-in** (§2.9) adjusts targets with a clear explanation.
- **Nutrition settings:** goal and rate, macro preference (lower-fat · balanced · higher-fat), manual macro override (§2.5), protein-only mode, hide calories, units, check-in day.
- Offline-first: the diary works with no signal and syncs later. Logging any food takes ≤ 3 taps from the Nutrition tab for repeat foods.
- Health: HealthKit / Health Connect for weight and steps in, workouts out.

**Not at launch:** AI photo logging (it costs money per photo; premium, later), meal plans, restaurant databases (paid licences).

---

## 3. Training Engine

### 3.1 Estimated 1-rep max (e1RM)
```
repsToFailure = reps + (RIR ?? 0)                  // RIR logged → more accurate
valid only if 1 ≤ repsToFailure ≤ 12
Epley   = load × (1 + repsToFailure / 30)
Brzycki = load × 36 / (37 − repsToFailure)
e1RM    = repsToFailure ≤ 10 ? mean(Epley, Brzycki) : Epley
```
**Bodyweight exercises:** `load = bodyweight × exercise.bwFactor + addedWeight`. `bwFactor` is a content field, e.g. push-up 0.64, knee push-up 0.49, pull-up / chin-up 1.00, dip 0.95, inverted row 0.55, bodyweight squat 0.85, pistol squat 0.85 (single leg). The coach consultant should verify these.

**Load for a target (autoregulation):**
```
%1RM(reps, RIR) = 1 / (1 + (reps + RIR) / 30)      // e.g. 5 reps @ RIR 2 → 0.811
targetLoad      = roundToAvailable(e1RM × %1RM)
```

### 3.2 Volume
```
hardSet      = not a warm-up AND (RIR ≤ 4 OR RPE ≥ 6 OR RIR not logged)
setsPerMuscle(week) = Σ hardSets × (1.0 if primary muscle, 0.5 if secondary)
volumeLoad   = Σ load × reps                       (shown in charts; not used for XP)

Weekly hard-set targets per muscle group:
  Beginner 8–12 · Novice 10–14 · Intermediate 12–18 · Advanced 14–22
```

### 3.3 Progression rules
**Double progression** (Beginner/Novice, and every accessory lift):
```
Each exercise has a rep range [lo, hi] and a target RIR of 1–3.
After a session:
  if every working set reached hi reps at RIR ≥ 1:
      load += increment;  reps reset toward lo
      increment = upper body: max(2.5 kg, 5%) · lower body: max(5 kg, 5%) → round to equipment
      dumbbells → the next available dumbbell; bodyweight → the next progression variant
  else if any set < lo for 2 sessions in a row:
      load × 0.90  (or the regression variant)
  else: keep the load, aim for +1 rep
```
**RIR-based** (Intermediate/Advanced, main lifts): `targetLoad` from §3.1 using the 4-week best e1RM. If the session e1RM beats the target by more than 3%, nudge the next session +2.5%. If it misses by more than 5%, hold the load.

**Calisthenics chains** (these power the Skill Tree): ordered lists such as `wall push-up → incline → knee → push-up → diamond → archer → pseudo-planche → one-arm`. Move up a level when you hit 3 × hi reps (or a hold of hi seconds) with clean form. Move down when you can't hit lo.

### 3.4 Deload and fatigue
```
Scheduled deload: Novice every 6th week · Intermediate+ every 5th week (4:1)
Early deload trigger: in 2 consecutive sessions, ≥ 2 main lifts with e1RM < 95% of their 4-week best
                      OR readiness < 40 for 3 consecutive days
Deload prescription: sets × 0.5, load × 0.90, target RIR + 2. Weekly boss paused ("Meditation Arc")
```

### 3.5 Readiness (optional daily check, 3 taps)
```
S_sleep    = clamp((hoursSlept − 4) / 3, 0, 1)        // 7 h+ = 1.0, 4 h = 0
S_energy   = (energy 1–5 − 1) / 4
S_soreness = (5 − soreness 1–5) / 4
S_hrv      = clamp(0.5 + (HRV_today − HRV_mean30) / (2 × HRV_sd30), 0, 1)   // only if a wearable is connected
R = 100 × weighted mean(sleep 0.35, energy 0.25, soreness 0.20, hrv 0.20)   // weights renormalized for missing inputs
R < 40 → offer a "Recovery Arc" swap (mobility) or volume −30%
```

### 3.6 Session builder
```
estimatedMinutes = 5 (warm-up) + Σ_sets (reps × 3 s + restSeconds) / 60
restSeconds by type: main compound 150 · secondary compound 120 · accessory 75 · core/isolation 60
If estimatedMinutes > the user's session length:
  1) drop accessory sets from lowest priority  2) pair antagonist accessories as supersets (rest × 0.6)
  3) never drop main compound sets below 2
Exercise selection: filter by equipment ∩ !contraindications(injuries) → pick by movement-pattern slot
                    → prefer exercises used before (consistency) → otherwise the lowest difficulty that fits the tier
```
**Warm-up generator** (when working load ≥ 40 kg): `40% × 5, 60% × 3, 80% × 1`. Between 20 and 40 kg, use `50% × 5`. Below that, no warm-up sets.
**Plate calculator:** `perSide = (target − barWeight) / 2`, filled greedily with the user's available plates, largest first. If the exact load isn't possible, show the closest lower load.

### 3.7 Cardio
```
HRmax  = 208 − 0.7 × age                                (Tanaka)
Zones (Karvonen if resting HR is known, else % of HRmax):
  targetHR = HRrest + pct × (HRmax − HRrest)
  Z1 50–60% · Z2 60–70% · Z3 70–80% · Z4 80–90% · Z5 90–100%
No HR data → zone from session RPE: RPE ≤ 3 Z1, 4–5 Z2, 6 Z3, 7–8 Z4, 9–10 Z5
```

---

### 3.8 Prescription by workout type
| Type | Sets × reps (or time) | Target RIR / RPE | Rest | Progression |
|---|---|---|---|---|
| Strength | 3–5 × 3–6 | RIR 1–3 | 150–240 s | Load +2.5–5 kg when every set hits the top reps at target RIR (§3.3) |
| Hypertrophy | 3–4 × 6–15 | RIR 0–2 (isolation 0–1) | 60–120 s | Double progression |
| Calisthenics | 3–5 × 5–12, or holds of 10–30 s | RIR 1–3 | 90–150 s | Move up the progression chain at 3 × the top of the range |
| HIIT | 30/30 × 10 · 40/20 × 8 · EMOM 12 · AMRAP 15 | RPE 8–9 | Built into the interval | +1 round, then shorter rest |
| Zone 2 | 30–60 min | Z2 HR / talk test | — | +10% duration per week, cap 90 min |
| Core | 2–3 × 8–15, or holds of 20–45 s | RIR 2 | 45–60 s | Harder variant |
| Mobility | 2–3 rounds, holds of 30–60 s | Easy | — | Range of motion, not load |
| Power | 3–5 × 2–5 | Max intent; stop when speed drops | 120–180 s | Height, distance or load |

Warm-up sets never count as hard sets and earn no XP (§4.1).

### 3.9 Today's workout selection
```
1. Active program → the planned workout for today's game date.
2. Missed yesterday's session?
   → offer "shift the week" (keep the order). Never schedule two hard sessions back to back
     for the same muscle group within 48 h.
3. Readiness < 40 (§3.5) → offer the light version: same pattern, volume −30%, or swap to Mobility / Zone 2.
4. Time available < planned → session builder time-squeeze (§3.6).
5. Equipment or injury change → re-slot exercises by movement pattern (substitutes, then regressions).
6. No program yet → workout of the day = an on-demand session matched to goal + location + level.
```

### 3.10 Weekly schedule, rest days and editing
```
Schedule = { programId, weekdays[] (user-picked, e.g. Mon·Wed·Fri), preferredTime (HH:mm), sessionMinutes, location, equipment }
Rotation  = program.days in order; each completed workout advances the pointer (missed days never skip a workout).
Rest day  = any weekday not in weekdays[].

Validation when the user edits weekdays:
  count must be in program.daysPerWeek (else suggest the closest program variant)
  warn if > 2 training days in a row for the same muscle group (full-body programs: no 3 days in a row)
Missed a scheduled day:
  next training day runs the missed workout (rotation pointer did not advance)
  "Train today instead" is offered on a rest day if yesterday was missed and the 48 h rule holds (§3.9)
  never more than 2 make-ups in one week; extra misses roll forward (no cramming)
Changes take effect from the next game day; a mid-block program switch keeps history, PRs and e1RM.
Reminder: local notification at preferredTime − 30 min on training days; none on rest days.
```
**Rest days are real days.** Home shows a Rest Day card (Rest Ritual quest, 3-min mobility, steps/Zone 2 suggestion, the next workout preview) and an honest "Train anyway" option that picks a recovery or Zone 2 session, not the next hard workout.

**Training settings screen** (Profile → Training): program · weekdays · preferred time · session length · location and equipment · injuries · goal · units · plates and bar weight · warm-up and cool-down defaults · voice coach. Every field is editable at any time, never only in onboarding.

### 3.11 Workout log and history
| Feature | Rule |
|---|---|
| **History** | Calendar (training, rest, missed) and a list. Workout detail shows every set, volume, duration, PRs, RPE and notes |
| **Per-set entry** | Weight, reps, RIR (or time for holds). Set types: warm-up · working · drop set · failure. The previous performance is shown inline ("Last: 60 kg × 8") |
| **Notes** | One note per session and a sticky note per exercise ("seat 4", "use the EZ bar") that shows next time |
| **Edit after finishing** | Allowed for 7 days: fix weight or reps, add or delete a set. The server recomputes PRs, stats and XP **as a diff** (idempotent event `workout_edit:{id}:{version}`). After 7 days the log is locked for rewards (leaderboard integrity), but notes stay editable |
| **Delete a workout** | Within 7 days. XP is reversed and it is removed from boards. A confirmation shows exactly what will change |
| **Manual log** | "Log a workout" for training done without the app (gym class, sport, run): type, duration, RPE and an optional distance. XP uses the real-minutes rule (§4.1). It is marked **unverified**, which counts for personal XP and streaks but **not** for monthly leaderboards |
| **Body log** | Weigh-ins (feed the trend, §1.4), optional waist/hip/chest measurements and optional progress photos (private, on device by default) |
| **Exercise history** | Per-exercise chart of e1RM and best set over time, plus the PR list |

### 3.12 Program library (target before launch)
| Program | Where | Level | Days/week | Split | Block |
|---|---|---|---|---|---|
| Foundation ✅ | Home | Beginner | 3 | Full body | 6 wk + deload |
| Iron Foundation ✅ | Gym | Beginner | 3 | Full body | 6 wk + deload |
| Linear Strength ✅ | Gym | Novice | 3 | A/B barbell | 6 wk + deload |
| Shinobi Path ✅ | Home | Novice–Intermediate | 4 | Upper/Lower calisthenics | 5 wk + deload |
| Upper/Lower Builder ✅ | Gym | Intermediate–Advanced | 4 | Upper/Lower | 5 wk + deload |
| Burn Protocol ✅ | Any | Beginner–Intermediate | 3–5 | Conditioning circuits | 6 wk + deload |
| Push / Pull / Legs ✅ | Gym | Intermediate–Advanced | 6 (or 3 = one rotation a week) | PPL | 5 wk + deload |
| Upper / Lower / Full ✅ | Gym | Novice–Intermediate | 3 | U/L/F, for busy lifters | 6 wk + deload |
| Powerbuilding ✅ | Gym | Intermediate–Advanced | 4 | Heavy main lift + hypertrophy accessories | 6 wk + deload |
| Lower Body & Glutes ✅ | Gym or Hybrid | Beginner–Intermediate | 4 | 2 lower-focus + 2 upper | 6 wk + deload |
| Dumbbell Only ✅ | Home gym | Beginner–Intermediate | 3 | Full body (bodyweight swaps if no dumbbells) | 6 wk + deload |

Every program shows **"Week 3 of 6 · Build"** and a **deload week** automatically (§3.4). Each new program passes the existing content tests (slot patterns, fallbacks, equipment coverage) before it ships.


## 4. Progression System (XP, Levels, Ranks, Stats)

### 4.1 XP sources (targets about 4 XP per minute of real work)
| Source | XP |
|---|---|
| Hard working set | `10 × effort`, where effort by RIR: 0 → 1.1 · 1 → 1.1 · 2 → 1.0 · 3 → 0.9 · 4 → 0.7 · not logged → 0.9. Warm-ups: 0 |
| Timed / cardio | `4 × zoneFactor` per minute. Zone factor: Z1 0.5 · Z2 1.0 · Z3 1.2 · Z4 1.5 · Z5 1.8 |
| Session completion bonus | `50 × completion` if completion ≥ 0.8 (completion = hard sets done / planned) |
| PR bonus | +25 each, max 3 per session |
| Daily Quest | 50 + streak bonus `min(streakDays, 30)` |
| Penalty Quest | 20 (and it restores the streak) |
| Side Quest | 15 each, max 3 count per day |
| Nutrition: complete day logged | 20 (logging consistency only, **never** for a deficit) |
| Weekly Shadow-Self boss | Win 150 · attempt (≥ 50% HP dealt) 50 |
| Rank Trial pass | 300 |
| Hidden Quest | 100 |
| Onboarding Awakening Assessment | 200 (one time) |

**Anti-grind limits:**
- Sets beyond 1.5 × the planned hard sets in a session earn 0 XP.
- **Daily XP cap is 500.** The excess is dropped, with the message "The System limits your gain today. Rest is also training."
- Typical engaged week: 4 training days × ~325 + 3 rest days × ~100 ≈ **1,600 XP/week**.

### 4.2 Level curve (checked with a script)
```
cumulativeXP(L) = round(65 × (L − 1)^1.77)
xpToNext(L)     = cumulativeXP(L + 1) − cumulativeXP(L)
levelFromXP(xp) = floor(1 + (xp / 65)^(1 / 1.77))     // then adjust ±1 to guard float edges
```
| Level | Total XP | XP to next | Weeks at 1,600 XP/wk (engaged) | Weeks at 1,000 XP/wk (casual) |
|---|---|---|---|---|
| 2 | 65 | 157 | first quest | first quest |
| 5 | 756 | 366 | ~3 days | ~5 days |
| 10 | 3,176 | 651 | 2.0 | 3.2 |
| 25 | 18,025 | 1,351 | 11 | 18 |
| 40 | 42,569 | 1,951 | 27 | 43 |
| 50 | 63,762 | 2,321 | 40 | 64 |
| 60 | 88,577 | 2,675 | 55 | 89 |
| 80 | 148,496 | 3,343 | 93 | 148 |
| 100 | 221,405 | 3,974 | 138 (~2.7 years) | 221 |

**Ability Points:** +1 AP per level, +2 extra at every multiple of 10. AP unlock Skill Tree nodes (§3.3 chains) and steer the next program block.

### 4.3 True Stats (0–100 internally; displayed × 10, e.g. "STR 437")
Every stat comes from a **percentile against norm tables** (by sex and age band). Each table has anchor points (p10, p25, p50, p75, p90, p95), and the stat is a piecewise-linear interpolation between them. The tables live in `@lb/content/norms/*.json`, are seeded from published norms (e.g. ACSM fitness-testing norms, Cooper Institute VO2max tables, strength-standard tables) and **must be verified by the coach before launch**.

| Stat | Formula |
|---|---|
| **STR** | Gym: `ratio = e1RM / bodyweight × ageFactor`, where `ageFactor = 1 + 0.01 × max(0, age − 35)` (capped at 1.4). STR_gym = mean of the top 3 lift percentiles in the last 90 days. Home: STR_cal = percentile of the highest calisthenics chain level (push, pull, legs). **STR = max(STR_gym, STR_cal)** |
| **AGI** | Percentile of VO2max estimate. Sources in priority order: Health/Watch VO2max → 2.4 km run `VO2 = 483 / minutes + 3.5` → Cooper 12-min `VO2 = (metres − 504.9) / 44.73` → YMCA 3-min step test (recovery HR norms) |
| **END** | `0.7 × mean percentile(max push-ups, plank hold, 60 s squats) + 0.3 × volumeScore`, where `volumeScore = 100 × min(1, avg weekly hard sets over 4 weeks / tier target)` |
| **VIT** | 14-day weighted mean: sleep 0.35 (`100 × clamp(1 − |avgSleep − 8| / 3, 0, 1)` around a 7–9 h band) · protein adherence 0.35 · hydration 0.15 · resting-HR percentile 0.15 (renormalized for missing inputs) |
| **SPI** | 28-day: `100 × (0.5 × quest completion rate + 0.3 × sessions done / planned + 0.2 × nutrition logging rate)` (logging dropped and renormalized if nutrition is off) |

**Implementation notes (Sprint 4):**
- Tests feeding END/STR/AGI = the onboarding assessment, overridden field-by-field by the latest Rank Trial results.
- Volume score target (whole body, weekly hard sets): beginner 30 · novice 40 · intermediate 50 · advanced 60.
- Calisthenics level = highest position reached in a progression chain with a logged working set of ≥ 5 reps in the last 90 days.
- Until sleep/nutrition data exist, VIT shows 30 and AGI shows 20 (both marked "Estimated" in the UI); SPI uses training adherence only until quests ship.
- Gym trials don't require a max-out: the STR event uses the best logged e1RM ratio from the last 90 days (squat, bench, deadlift, OHP). With no lift history, push-ups are used.
- Interval/quick sessions earn XP only for real active time (pauses and skips don't count) and get no completion bonus (§4.1).

**Detraining decay:** STR, AGI and END hold for 4 weeks without new data, then drop 1% per week, never below 50% of the peak. A new test or PR restores them instantly.

**Power Level** (the shareable number): `round((STR + AGI + END + VIT + SPI) × 10 × (1 + level / 100))`.

### 4.4 Ranks and Rank Trials
| Rank | Level gate | Composite trial percentile | No single event below |
|---|---|---|---|
| D | 10 | ≥ 30 | 10 |
| C | 25 | ≥ 50 | 30 |
| B | 40 | ≥ 70 | 50 |
| A | 60 | ≥ 85 | 65 |
| S | 80 | ≥ 95 | 75 |

```
composite = Σ_event classWeight[event] × percentile(event)
classWeights (STR / END / AGI):
  Fighter 0.5/0.25/0.25 · Juggernaut 0.4/0.4/0.2 · Assassin 0.3/0.4/0.3
  Ranger 0.15/0.25/0.6 · Monk 0.25/0.5/0.25 (plus a mobility event) · Hybrid 0.34/0.33/0.33
Trial events (home variant): max push-ups, plank hold, 60 s squats, 2.4 km run OR 3-min step test
Trial events (gym variant): replace push-ups and squats with e1RM ratios (squat, bench, deadlift or overhead press)
Retry cooldown: 7 days. A rank is never lost. After 60 days inactive it shows a "dormant" tag until the next workout.
Leaderboards for A and S require verification: an HR trace attached, or a short video approved by 2 guild officers or a moderator.
```

### 4.5 Streaks
```
streak +1 when the Daily Quest is completed within the game day (rest days: the 3-minute "Rest Ritual" counts)
Missed day →
  1) auto-use a Streak Shield if one is available (2 free per calendar month; more from the season pass)
  2) else enter the Penalty Zone: complete the Penalty Quest + the Daily Quest the next day → streak preserved
  3) else the streak resets to 0; "longest streak" is kept forever
Sick/Injury Mode: freezes the streak, up to 7 days per rolling 30 days
Milestones: 7 · 30 · 100 · 365 days → titles and cosmetic frames
```

### 4.6 Daily Quest scaling
```
Slots: push · legs · core (+ an optional cardio slot for Ranger)
baseline = the user's latest max for that slot (from assessment / tests)
target   = round(baseline × f)        f starts at 0.60 (sub-maximal, any number of sets)
On training days: f × 0.6 (a lighter "activation" quest)
Each week with ≥ 5/7 completions: f += 0.02 (max 1.00)
Two failed days in a row: f −= 0.10 (min 0.40)
Time box: if the estimated duration is over 12 minutes, scale every slot down proportionally
```

**Implementation notes (Sprint 5):**
- Quests are one row per template per game day (`daily`, `penalty`, side ids, `sick`, `boss`), unique on (user, date, template). Streaks resolve lazily and idempotently on the first request of a new game day.
- The Daily Quest carries the Rest Ritual as an alternative on rest days (`progress.option = 1`). The Penalty Quest offers two injury-safe options (burpees / wall sit / plank).
- Progress is capped at 3× each target (plausibility). Completion XP is granted exactly once, through the same daily cap as workouts.
- Side quests: `auto:*` ones (today's program workout, the mobility quick session) can only be claimed once verified from logged data. Manual ones are honest check-offs until nutrition and Health data verify them (Sprint 6).
- The boss is claimed (+150 XP, title progress) once it's defeated, at most once per week.

### 4.7 Shadow-Self weekly boss
```
Compare this week (the 7 game days so far) with the same week 4 weeks ago:
  metrics m: hard sets · volume load on planned muscle groups · best e1RM (key lifts) · Z2+ cardio minutes · quest completion
  weights w_m follow the class (Fighter weighs e1RM, Ranger weighs cardio, …), Σ w = 1
  r_m = current_m / past_m        (past_m = 0 → use that week's planned target instead)
  S   = Σ w_m × min(r_m, 1.5)
  requiredS by tier: Beginner 1.03 · Novice 1.02 · Intermediate 1.01 · Advanced 1.00
Boss HP shown = max(0, 1 − S / requiredS) × 100%   (updates live as you train)
Win: S ≥ requiredS. Paused during deloads. Weeks 1–4: the "Shadow's Prophecy" uses planned targets.
```

### 4.8 Integrity and plausibility checks (server)
| Check | Rule | Result |
|---|---|---|
| PR jump | e1RM > 1.15 × best in the last 30 days | "Confirm PR" prompt. Counts personally; leaderboard only once confirmed |
| Impossible reps | reps > 100 for a non-endurance exercise, or weight > 4 × bodyweight on any lift | Flagged, no XP |
| Speed | sustained more than 1 hard set per 45 s over 10+ sets | Flagged |
| Clock | clientTs more than 5 min in the future | Rejected. Events older than 48 h sync, but earn no league credit |
| Daily cap | §4.1 | Excess dropped |

Flags are never shown as accusations. They only affect leaderboard eligibility.

---

## 5. Community (Global + Friends)

Three circles, each with a different level of openness:

| Circle | Who | What you can do |
|---|---|---|
| **Global: "The Hall"** | Every eligible hunter worldwide | Monthly leaderboards, the public feed, follow anyone, react, comment |
| **Guild** | Up to 20 members | Guild chat, weekly Raid, guild feed |
| **Friends** | Mutual follows | Friend Streaks, Duels, direct messages (18+) |

**Design principles**
- Ranking rewards **effort and consistency**, not genetics or a head start, so a beginner can top a board.
- Moderation runs **before** content is shown. Trust is earned gradually.
- No public board ever ranks **body weight, weight loss or calories**, to protect against eating disorders.

### 5.1 Monthly global leaderboards ("Top Hunters of the Month")
Boards run on calendar months (UTC). Live standings refresh every 15 minutes. **Results are finalised on day 3 of the next month**, after the top 10 of every board has been reviewed.

| Board | Score | Why it's fair |
|---|---|---|
| **Most Consistent** (headline board) | `100 × (0.6 × sessionsDone / sessionsPlanned + 0.4 × questDays / daysInMonth)`; tie-break: longest streak, then earliest to reach the score | Anyone can reach 100. Needs ≥ 8 planned sessions |
| **Most Improved** | `100 × (PL_end − PL_start) / PL_start` from **re-tested** stats only (tests ≥ 21 days apart); each stat counts at most +15 points per month | Rewards growth. Caps stop "sandbagging" a weak first test |
| **XP Champions** | Σ granted XP in the month (after the 500/day cap and plausibility checks, §4.8) | The daily cap means grinding can't win |
| **Rank Leaders** (all-time) | Highest **verified** rank, then Power Level | Needs A/S verification (§4.4) |
| **Class boards** | The Most Consistent formula, filtered by class | More winners, more identity |

- **Divisions:** every board is shown overall and by rank tier (E–D · C–B · A–S). Optional filters: country and class. Strength-based views also filter by sex and age band.
- **Eligibility:** signed-in (not guest) account at least 14 days old, 18+, public profile on, no upheld cheating flag this month. Users under 18 never appear on global boards.
- **Rewards:** the "Hunter of the Month" title + an animated profile frame (top 1 per board), "Top 100" badge, and a feature in the **Hall of Hunters** page and the monthly recap. **Cosmetic only. No cash or prizes** (avoids gambling and contest regulations).
- **Integrity:**
  - Only plausible events count (§4.8).
  - An anomaly check flags any day with z > 3 versus the user's own 30-day XP history, using σ = max(σ_actual, 15% of mean, 30 XP) so steady users aren't flagged for one bigger session.
  - The top 10 of each board are reviewed by hand before results are published.
  - A disqualification removes the user from that month's boards only, with an appeal option.

### 5.2 Progress sharing and the global feed
**Post types**
| Type | Content | Default visibility |
|---|---|---|
| Auto milestone | Rank-up, PR, level milestone (every 5), program completed, streak 30/100/365, title earned | Followers (each type can be made public, or turned off) |
| Progress post | Text up to 500 characters + up to 4 photos + an optional attached workout summary card | Chosen per post: Public · Followers · Guild · Only me |
| Transformation | Before/after photo pair with the anime "Awakening" frame | Only me (sharing it is an explicit choice) |

- **Feed tabs:** *Following* (chronological) · *Global* (ranked) · *My Rank* (peers at your rank tier, so beginners see people like them).
- **Global ranking:** `hot = (respect + 2 × comments + 3 × shares) / (ageHours + 2)^1.5`, max 2 posts per author per page, already-seen posts pushed down.
- **Reactions:** 6 preset stickers (Respect, Limit Broken, Ganbatte!, Beast Mode, Nice form, Let's go). The total shown is "Respect".
- **Comments:** up to 280 characters, one level of replies. The author can turn comments off or limit them to followers.
- **Never shown publicly:** weight, body measurements, food logs, location. Workout cards show exercises and personal records, not body weight.

### 5.3 Communication in the System
| Channel | Who | Rules |
|---|---|---|
| Comments | Eligible users, on posts they can see | Pre-moderated, rate limited |
| Guild chat | Guild members | Text + stickers, Realtime, pre-moderated |
| Direct messages | **Mutual follows only, both 18+** | Text only at first (no images), message requests, one-tap block |
| System broadcasts | From the app | Monthly results, events, Raid alerts; written in the System voice |
| Mentions | `@handle` in comments | Notifications respect quiet hours and caps (§10 of PLAN) |

Public profiles show a **handle** (never the real name), hero, class, rank, Power Level, titles, current program and public posts.

### 5.4 Trust levels (earned access)
| Level | Requirement | Unlocks |
|---|---|---|
| T0 New | Signed up | React, follow, read everything |
| T1 Hunter | 3 days + 3 workouts logged | Comment, guild chat |
| T2 Trusted | 14 days + level 10 + no upheld reports | Public posts with photos, DMs (18+), appear on boards |
| T3 Veteran | 60 days + level 25 + good standing | Higher rate limits, "Helpful" flag on comments, can nominate guild officers |

Upheld reports move a user down one level for 30 days. Spam is shadow-limited: the spammer sees their own posts, nobody else does.

### 5.5 Safety and moderation (global scale)
1. **Pre-moderation:** every text passes a wordlist, then an AI classifier (a small Claude model) for harassment, hate, sexual content, self-harm, spam and scams. Every image passes nudity/self-harm detection. Anything flagged stays pending and goes to the queue.
2. **Body-image safety:** no weight-loss boards. Photo posts can't include weight numbers unless the author adds them. Posts about extreme restriction show a supportive resource card.
3. **Under 18:** no global posting, no DMs, not on public boards, profile private. Friends and private guilds only, reactions only.
4. **Tools for everyone:** report, block (mutual invisibility), mute, hide comments, comments off, private profile.
5. **Operations:** an admin queue in `apps/web` with SLAs (high-severity reports within 24 h), audit log, appeals, and three-strike enforcement.
6. **Rate limits:** posts 5/day, comments 30/hour, DMs 50/day; lower at T0–T1.

### 5.6 Friends, guilds and raids (unchanged rules)
| Feature | How it works |
|---|---|
| **Friend Streak** | Two friends both complete the Daily Quest → a shared streak on both profiles. Each friend can **gift a Streak Shield** once a month |
| **Duels** | A 7-day challenge. Score = `XP this week / own 4-week average weekly XP`, so a beginner can beat a veteran |
| **Guilds** | Up to 20 members; Leader / Officer / Member. Public (filter by language, timezone, class, level band) or private (code) |
| **Leagues** | Weekly XP leagues of 30 (Bronze → Mythic). Top 7 promote, bottom 5 demote |
| **Hunter License** | Shareable card (rank, class, Power Level, title, hero) exported to Instagram, TikTok and WhatsApp |

**Guild Raid math**
```
Each member's expected weekly XP: E_i = mean weekly XP over the last 4 weeks (minimum 800 for new members)
Boss HP (set Monday 03:00 guild time) = 0.8 × Σ_i E_i over members active in the last 14 days
Damage_i = XP_i earned this week (after daily caps and plausibility)
Contribution%_i = Damage_i / E_i                     → the leaderboard shows effort, not raw size
Raid cleared → every member with Contribution% ≥ 25 gets the loot (cosmetics, raid title progress)
Live HP is pushed to guild members over Supabase Realtime
```

### 5.7 Data model additions (Prisma)
```prisma
model Follow       { followerId String @db.Uuid  followeeId String @db.Uuid  createdAt DateTime @default(now())  @@id([followerId, followeeId]) }
model PublicProfile { userId String @id @db.Uuid  handle String @unique  isPublic Boolean @default(false)  trustLevel Int @default(0)  bio String? }
model Post         { id String @id @db.Uuid  authorId String @db.Uuid  type String  body String?  payload Json?  visibility String  status String  commentsMode String @default("all")  createdAt DateTime @default(now())  @@index([status, createdAt]) }
model PostMedia    { id String @id @db.Uuid  postId String @db.Uuid  storageKey String  width Int  height Int  status String }
model Comment      { id String @id @db.Uuid  postId String @db.Uuid  authorId String @db.Uuid  parentId String? @db.Uuid  body String  status String  createdAt DateTime @default(now()) }
model Reaction     { postId String @db.Uuid  userId String @db.Uuid  sticker String  @@id([postId, userId]) }
model Conversation { id String @id @db.Uuid  userA String @db.Uuid  userB String @db.Uuid  status String  @@unique([userA, userB]) }
model Message      { id String @id @db.Uuid  conversationId String @db.Uuid  senderId String @db.Uuid  body String  status String  createdAt DateTime @default(now()) }
model BoardEntry   { month String  board String  division String  userId String @db.Uuid  score Float  rank Int  final Boolean @default(false)  @@id([month, board, division, userId]) }
model MonthlyAward { id String @id @db.Uuid  month String  board String  userId String @db.Uuid  place Int  titleId String }
model ModerationAction { id String @id @db.Uuid  targetType String  targetId String  action String  reason String  actorId String?  createdAt DateTime @default(now()) }
// Kept from before: FriendStreak, Duel, Guild, GuildMember, GuildMessage, Raid, RaidContribution, LeagueGroup, LeagueMember, Report, Block
```
(Shorthand. Expand to one field per line in the real schema.)

---

## 6. Enhancements Worth Adding (Ranked by Impact per Effort)

| # | Enhancement | Why |
|---|---|---|
| 1 | **Progress photos** (private) with an anime-frame "Before / After Awakening" side-by-side | The most shared moment in fitness apps. Private by default |
| 2 | **Body measurements** (waist, chest, arms) with trends | Shows progress when the scale stalls (recomp) |
| 3 | **Gym Mode**: oversized buttons, screen stays awake, one-hand logging | The logger is used sweaty and in a hurry |
| 4 | **Home-screen widgets + Live Activity** (rest timer, Daily Quest) | Daily visibility without opening the app |
| 5 | **AI weekly debrief** in the System voice, from the real numbers in §2.9 / §4 | Feels personal; cheap with a small model |
| 6 | **Smart swap**: "machine taken" → equivalent exercise, keeping the movement pattern and load estimate | Removes gym friction |
| 7 | **Meal templates + "copy yesterday"** | Logging speed is the #1 driver of nutrition retention |
| 8 | **Offline-first everywhere** (ARCHITECTURE.md §6.2) | Gyms have bad signal |
| 9 | **Rest-day content**: mobility flows, 2-minute lore stories | Keeps the streak meaningful on off days |
| 10 | **Apple Watch / Wear OS logger** (later) | Verified HR also powers Rank Trial verification |

---

## 7. Subscriptions (Added After the Full App Is Built)

The plan is to **build the whole app first with everything unlocked**, then switch subscriptions on without refactoring anything. That only works if the gating seams exist from day 1.

### 7.1 What we build from day 1 (cheap now, painful later)
```
packages/content/features.json      // the single feature matrix
{ "adaptiveTdee": "premium", "aiPhotoLog": "premium", "allPrograms": "premium",
  "shadowBossAnalytics": "premium", "premiumSeasonTrack": "premium",
  "dailyQuests": "free", "logger": "free", "barcode": "free", "rankTrials": "free", "guilds": "free" }

App:    useFeature('aiPhotoLog') → { enabled, reason: 'free' | 'premium' | 'paywall-off' }
        <Gate feature="aiPhotoLog" fallback={<UpsellCard/>}> … </Gate>
API:    requireFeature('aiPhotoLog') middleware
Switch: PAYWALL_ENABLED=false (remote config via PostHog flag) → every check returns enabled
Table:  Entitlement { userId, key: 'premium', source: 'dev' | 'revenuecat' | 'promo' | 'founder', expiresAt }
```
Every premium feature goes through `useFeature` / `requireFeature`. No feature is ever checked with an ad-hoc `if (isPremium)`.

### 7.2 Free vs Premium (final)
| Free (the full core loop) | Premium "Awakened" |
|---|---|
| Daily, Side and Penalty Quests, streaks, shields | All programs and classes, with auto-progression |
| Leveling, ranks, Rank Trials, True Stats | Adaptive TDEE + weekly macro adjustment |
| Unlimited workout logging, PRs, rest timer | AI photo and voice food logging |
| 3 starter programs (home + gym) | Advanced analytics: Shadow-Self breakdown, stat history, volume per muscle |
| Barcode + search food logging, static macro targets | Premium season-pass track, exclusive auras and frames |
| Friends, guilds, raids, leagues | +2 Streak Shields per month |

**Never pay-to-win.** XP, stats and rank are never sold.

### 7.3 Store setup (when it's time)
1. **App Store Connect:** a subscription group `LIMITBREAK Awakened` with `lb_awakened_monthly` and `lb_awakened_annual`. Add an introductory offer on the annual plan (7-day free trial). Fill in subscription metadata and the review screenshot.
2. **Google Play Console:** a subscription `awakened` with base plans `monthly` and `annual`, plus an offer `trial-7d` on annual.
3. **Pricing:** start at $9.99/month and $59.99/year (about 50% off monthly). Use the stores' automatic local pricing, then manually lower prices for price-sensitive markets (Brazil, India, the Philippines, Indonesia, Mexico).
4. **Agreements:** sign the Paid Apps agreement and the tax/banking forms in both stores. This can take days, so start it early.

### 7.4 RevenueCat setup
```
Project → apps (iOS + Android) → products imported from both stores
Entitlement:  "premium"  ← both products attached
Offerings:    "default" (monthly + annual) · "winback" (annual discount) · "founder" (launch offer)
Paywall:      RevenueCat Paywalls (remotely editable, A/B testable) via react-native-purchases-ui
```
App integration:
```ts
// src/lib/purchases.ts
Purchases.configure({ apiKey: Platform.select({ ios: IOS_KEY, android: ANDROID_KEY })! });
await Purchases.logIn(supabaseUserId);              // same id everywhere; guest → aliased on sign-in
Purchases.addCustomerInfoUpdateListener(info =>
  useSubscriptionStore.getState().set(info.entitlements.active['premium'] != null));
```
- Requires an EAS dev client build (doesn't run in Expo Go).
- Testing: Apple sandbox testers plus a local StoreKit configuration file, Google license testers, and RevenueCat's sandbox flag.

### 7.5 Server side (the source of truth for premium API features)
```
RevenueCat webhook → POST /webhooks/revenuecat  (shared-secret Authorization header)
  idempotent by event.id → upsert Subscription { userId, productId, store, status, periodEnd, environment }
  → upsert Entitlement { key: 'premium', source: 'revenuecat', expiresAt: periodEnd }
Events handled: INITIAL_PURCHASE, RENEWAL, CANCELLATION, UNCANCELLATION, EXPIRATION,
                BILLING_ISSUE, PRODUCT_CHANGE, TRANSFER, SUBSCRIPTION_PAUSED
requireFeature() reads Entitlement (cached 5 min). If a webhook is missed,
the app calls /me/sync-entitlements, which asks the RevenueCat REST API directly.
```

### 7.6 Paywall placements and rules
- **Show it:** after the Status Window reveal at the end of onboarding (soft, with "Continue free"), when a premium feature is tapped, on the level-10 celebration screen, and in Settings.
- **Never show it** during a workout, during the Penalty Zone, or more than once per day unprompted.
- **Trial reminder:** a notification 2 days before the trial ends. Honest, and it reduces refunds.
- **Compliance:** a Restore Purchases button, auto-renew terms, Terms and Privacy links on the paywall, and a "Manage subscription" deep link.

### 7.7 Launch transition (from free build to paid)
- Everyone who joined before subscriptions launch gets a **"Founder" title + aura** and **30 days of premium** (`Entitlement.source = 'founder'`), plus the `founder` offering (discounted first year).
- **Nothing the user created is ever locked away.** Logs, history and programs stay readable. Only *new* premium actions need the subscription.
- Announce it in-app 14 days ahead.

### 7.8 Subscription metrics (PostHog + RevenueCat)
Paywall view → trial start (target 8–15% of installs) → trial-to-paid (35–50%) → month-2 retention → refund rate (< 3%), all broken down by country, placement and offering.

---

## 8. Test Fixtures Required Before Launch
- [ ] §2.6 worked example produces the exact numbers shown
- [ ] TDEE converges to within ±50 kcal of the true value in a 60-day synthetic run with noisy weights (±1 kg) and 80% logging
- [ ] Level table in §4.2 matches `cumulativeXP` exactly
- [ ] Simulation: 1,000 synthetic users × 365 days → level and rank pacing within ±15% of the §4.2 targets
- [ ] Safety rails: under-18 cut blocked, floors enforced, no XP path rewards a deficit
- [ ] Raid HP: a guild hitting exactly 80% of expected XP clears on the last day
- [ ] Plausibility: each §4.8 rule has a passing and a failing case
- [ ] Feature gates: `PAYWALL_ENABLED=false` unlocks everything; `true` + no entitlement blocks premium only
