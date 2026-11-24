# Routines, challenges and rewards (Nov 2026)

## 1. My routines ✅ (built)
- Users build their own week: named days ("Push", "Legs"), exact exercises from the library, sets, a rep range or time, reps in reserve, rest, supersets, and which weekday each day runs on. They can start blank or copy a built-in program at their level.
- A routine runs through the same engine as programs (`routineDay()` in `packages/engine/src/training/routine.ts`):
  - suggested weights and warm-up sets
  - Light / Intense and the Time chips
  - pain and injury swaps
  - the session player, PRs, XP and history
- Not applied to routines: level reshaping and the 50+ low-impact swaps (the user chose these exercises).
- Fixed weekly schedule: a missed day shows as "missed" (programs move it forward instead). On a rest day the app previews the next workout.
- Activating a routine with 2–6 days sets the account's training days, so reminders and quests follow it.
- Private and synced: `GET/PUT/DELETE /workouts/routines`. The newest edit wins across phones. Up to 20 routines, 7 days and 20 exercises per day.
- Program id `custom-<uuid>`; `PUT /workouts/program` accepts it only for the owner.

## 2. Habit challenges ✅ (built)
- Solo, always flexible:
  - Grace days (default ≈ 1 in 10) cover the first misses.
  - Later misses only push the finish date back.
  - Nothing ever restarts.
- Tasks can be exercises with a ramp ("15 push-ups, +1 every 2 days") or simple habits ("Drink 3 L of water"). There are 6 presets plus one-tap habit ideas.
- Check-in for today, or fix yesterday, on the Quests tab.
- Rewards:
  - +10 XP per fully done day, paid once (unticking never re-pays).
  - A finish bonus of 50 + 2 × days, capped at 250.
  - +50 if flawless.
  - A "challenge cleared" celebration.
- API: `/challenges` (list, create, check in, end). Up to 3 active.

## 3. Before deploying
- Apply migrations **0017_routines**, **0018_challenges** and **0019_achievements** to Supabase (`pnpm db:migrate`), then deploy the API.

## 4. Achievements and titles ✅ (built)
- **19 achievements** in `packages/content/src/data/achievements.json`:
  - 14 with bronze / silver / gold / platinum tiers, covering training, consistency, progression and nutrition
  - 5 hidden: Dawn Hunter, Night Owl, Weekend Warrior, Marathon Session, The Comeback
  - 61 tiers and 35 titles in all
- **Evaluated on the server** from real records (`POST /achievements/check`, engine `evaluateAchievements`):
  - Only workouts logged live count.
  - Tiers are permanent.
  - Each tier pays XP once (25 / 50 / 100 / 250; hidden 150), even if two checks race.
  - The app asks for a check after a workout, a quest, a boss, a trial or a challenge; at most 3 medal celebrations play at once.
- **Medal art** (`AchievementBadge`, Skia vector): a scalloped metal rosette by tier, an enamel centre with the icon, a glow for gold, an iridescent platinum, and a progress arc while locked.
- **Screens:**
  - trophy case (`/achievements`): completion ring, tier counts, filters, badge grid with progress
  - detail with the tier ladder (XP, titles, dates)
  - title picker
  - profile showcase
  - Home "next badge" nudge
- **Titles** (`PUT /achievements/title`) show on the profile, the Hunter License (and its share text), community posts and public hunter pages.
- Web preview only: browsers allow about 16 WebGL contexts, so a long badge grid shows broken squares there. Native Skia has no such limit.

## 5. Frames and auras ✅ (built)
- **20 frames and 12 auras** (`cosmetics.json`, existing ids kept). Each is one of:
  - free
  - bought with Essence (some auras also need a rank)
  - earned from an achievement tier (never sold; granted automatically once the tier is earned)
- Examples: Golden Laurel (Iron Will Gold), Platinum Halo (Iron Will Platinum), Eternal Flame (365-day streak), Sovereign Crown (S-Rank), Dawnbreak (hidden Dawn Hunter), Stormcaller aura (Engine Room Gold).
- **Essence** now also comes from achievement tiers (10 / 20 / 40 / 80, hidden 50), alongside workouts (10). It keeps its daily cap and buys looks only, never XP or stats.
- **Art (procedural Skia):**
  - `FrameRing` in 9 styles: ring, laurel, crown, flame, crystal, circuit, halo, thorns, rivets
  - `HeroEmblem` aura styles: pulse, orbit, flare, storm, each in the aura's own colours
  - `HunterSigil` combines them
- **Where they show:**
  - **Frames** go around the **profile picture**, never the sigil: the profile header, and in Community a lightweight two-tone ring around the initial (no canvas).
  - **Auras** glow around the **hunter sigil**: the Home hunter card and the Style preview.
- **Profile picture:** tap it on the profile to choose, take or remove a photo, or change the frame. The photo is a small square image kept on this phone only (encrypted store `lb-profile-photo`, cleared on sign-out). Community shows the framed initial until photo uploads have image moderation.
- **None:** both tabs start with a "None" card (`PUT /avatar/equip` with `cosmeticId: null`).
- **Style screen** (`/style`, Profile → Style; `?slot=frame|aura&item=` deep links): live preview (frames on the profile picture, auras on the sigil), Essence balance, Frames/Auras tabs, rarity, owned / price / "Earn …" with progress, one action button (Equip / Buy / locked). The achievement celebration names the looks it unlocks.
- Dev-only frame gallery at `/dev/frames`.
- Demo mode runs the same rules on the phone (store `lb-look`, cleared on sign-out).

## 6. Rewards and avatar: what can be built properly now
The layered avatar (outfits, hair) needs consistent art first. See `docs/AVATAR.md`: VRoid renders or a commissioned artist. Shipping it with placeholder art would look cheap, so it stays parked. These can be built to a professional standard in code, without new illustration:

| Feature | What it is | Builds on |
|---|---|---|
| **Achievements** | Data-driven badges checked on the server from real events: first workout, 10/50/100/500 workouts, PRs, streak 7/30/100/365, rank-ups, challenges cleared (flawless tier), 4/12 weeks of a routine kept, nutrition days logged. Tiers: bronze, silver, gold, platinum. | Event log, XP ledger, celebrations queue |
| **Badge art** | Vector badges drawn in Skia (shape × tier colour × icon), the same craft as `RankBadge` / `HeroEmblem`. Consistent and crisp at any size. | `src/ui/fx` |
| **Titles** | Earned from achievements; the hunter equips one, shown under their name on the Hunter License, profile and posts. The `title` reward already exists. | `Reward` type, community profile |
| **Frames and aura colours** | Profile frames and aura palettes, unlocked by achievements or bought with Essence. Procedural (Skia shader), so no illustration is needed. | `AuraLayer`, Essence ledger, `AvatarLoadout.frame/aura` |
| **Trophy case** | A profile section with earned badges, progress toward the next one, and a share card. | Hunter License / share cards |

Recommended order: ~~achievements and titles~~ (done) → ~~frames and aura cosmetics with Essence~~ (done) → the avatar once art exists.

## 7. Visual polish from reference apps ✅
- **Habit library** (challenge builder → Habits): 24 habits as illustrated cards (scene colours, a large emblem, difficulty bars) in Body / Fuel / Mind / Routine, plus "Write your own". Shared `SceneCard` component with an optional `art` image, so real illustrations can replace the generated scenes later.
- **Trophy case:** "N of 19 achievements unlocked"; tiles on category-coloured scenes; hidden ones are dark "?" tiles.
- **Rank mastery carousel** on the profile (E → S cards with badge, epithet, requirements and the level bar toward the next trial), replacing the plain rank list.
- Not adopted: per-item painted illustrations (no art pack yet; see `docs/AVATAR.md`) and a "Top X% of users" rating (would need a server-side percentile).
