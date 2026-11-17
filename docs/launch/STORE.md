# Store Listing & Compliance Answers

## Listing
- **Name:** LIMITBREAK *(pending the name check in LAUNCH.md)*
- **Subtitle (iOS, 30):** Anime-ranked strength training
- **Short description (Play, 80):** Real workouts and macros, levelled up: ranks, quests and an anime trainer.
- **Category:** Health & Fitness (secondary: Lifestyle)
- **Keywords (iOS, 100):** workout,gym,strength,calisthenics,macro,calorie,anime,rank,level up,quest,home workout,fitness rpg

**Description**
> Train like a hunter, progress like a real athlete.
>
> LIMITBREAK turns real, coach-built training into an anime adventure. Every program is evidence-based: progressive overload, deloads, and workouts that adapt to your equipment, injuries and time. Your progress is real too: ranks are earned in Rank Trials scored against real fitness norms, not bought.
>
> • 11 programs for home, dumbbells and the gym: full body, upper/lower, push/pull/legs, powerbuilding, glutes, calisthenics and conditioning
> • A set-by-set coach: it adjusts your next weights from your reps and effort
> • Follow-along sessions with voice cues and an animated trainer
> • Daily Quests, streaks and a weekly Shadow boss that keep you consistent
> • Real nutrition: USDA-verified foods, barcode scanning, and calorie targets that learn from your weight trend
> • Your choice of days and training time, with rest days that actually mean rest
>
> No pay-to-win. Your data is yours: export it or delete your account any time in the app.

## Age rating
- iOS: 12+ (Infrequent/Mild: none; user-generated content arrives with community features later → re-rate then). Answer "No" to gambling, contests, unrestricted web access.
- Google Play (IARC): Everyone 10+/PEGI 7-equivalent expected; no violence beyond stylised anime imagery.

## App Privacy (iOS "nutrition label")
| Data type | Collected | Linked to user | Tracking | Purpose |
|---|---|---|---|---|
| Health & Fitness (workouts, weight, nutrition) | Yes | Yes | No | App functionality |
| Email address (sign-in) | Yes | Yes | No | App functionality |
| User ID | Yes | Yes | No | App functionality |
| User content (notes, trial videos) | Yes | Yes | No | App functionality |
| Crash data | Yes, only if Sentry is enabled | No | No | App functionality |
| Product interaction | Yes, only with user opt-in | No | No | Analytics |
Matches `ios.privacyManifests` in `apps/mobile/app.json`; keep them in sync.

## Google Play Data safety
- Data encrypted in transit: **Yes** · Users can request deletion: **Yes (in-app: Profile → Delete account)** · Data shared with third parties: **No** (processors only: Supabase hosting, Sentry, PostHog).
- Collected: Health & fitness, Email, User IDs, App activity (opt-in analytics), Crash logs, Videos (optional trial verification).

## Required in-app items (all built)
- Account deletion in-app: Profile → Your data & account → Delete account (typed confirmation; deletes data and the auth user).
- Data export: Profile → Export my data.
- Health disclaimer and PAR-Q screening in onboarding; under-18s get no calorie deficit.
- Permission texts: camera (barcodes), photo library (trial video only).

## Screenshots (6 scenes, same order on both stores)
1. Home: rank, level and today's plan, with "Real workouts. Anime progression."
2. Workout logger mid-set with coach adjustment: "A coach in every set."
3. Follow-along player with the aura: "Train with your trainer."
4. Nutrition diary: "Real macros. Verified foods."
5. Rank Trial result: "Ranks you earn, not buy."
6. Week view and rest day: "Your days. Your time."
