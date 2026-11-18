# Soft Launch Checklist (free, no subscriptions)

> Sprint 7 output. Work top to bottom; every box is a real blocker unless marked *optional*.

## 1. Accounts and names (do first)
- [ ] **Name check:** search "LIMITBREAK" / "Limit Break" in the App Store, Google Play and a trademark database (USPTO, EUIPO, your country). Fitness and gaming apps with similar names exist; pick a fallback name now.
- [ ] **Bundle IDs:** `com.limitbreak.app` is a placeholder. Use a reverse-domain you own (iOS and Android), then update `apps/mobile/app.json`.
- [ ] Apple Developer Program ($99/yr) and Google Play Console ($25 one-time).
- [ ] Support email and a simple website page (privacy policy + terms + support) at a public URL.

## 2. Backend
- [ ] Supabase project (free tier is fine for soft launch). Enable asymmetric JWT signing keys.
- [ ] Run migrations: `pnpm db:migrate` → `0001`…`0011` (0008 also creates the private `trial-videos` bucket; 0009 restore state; 0010 community; 0011 AP/cardio integrity).
- [ ] Deploy the API (`apps/api`) and set environment variables:

| Variable | Needed for |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Database |
| `SUPABASE_URL` | Token verification |
| `SUPABASE_SERVICE_ROLE_KEY` | **Account deletion** (store requirement) and trial-video signed URLs. Server only, never in the app |
| `USDA_API_KEY` | Food search (free key from api.data.gov) |
| `ALLOWED_ORIGINS` | CORS for any web front-end (comma-separated) |
| `MODERATOR_IDS` | User ids allowed to review A/S trial videos |
| `SENTRY_DSN` | *optional* API crash reports |
| `PAYWALL_ENABLED` | Leave `false` for the free launch |

- [ ] Publish PRIVACY.md and TERMS.md (after legal review) and set `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL`. The onboarding consent step links to them.
- [ ] App env (EAS → Environment variables): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` (publishable), `EXPO_PUBLIC_API_URL`, *optional* `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY` (+ `EXPO_PUBLIC_POSTHOG_HOST`, EU by default), `EXPO_PUBLIC_MEDIA_BASE_URL` (Tier-2 clips).

## 3. Monitoring (*optional but strongly recommended*)
- [ ] Sentry: create a React Native project and a Node project (free tier). Set the two DSNs.
- [ ] For readable native crash traces, add the `@sentry/react-native/expo` config plugin with your org/project **and** a `SENTRY_AUTH_TOKEN` EAS secret. Without the token it must stay out of `app.json` (it fails builds), which is why it isn't there now.
- [ ] PostHog (EU cloud, free tier): project key → `EXPO_PUBLIC_POSTHOG_KEY`. Users are asked once (opt-in); nothing is sent before they agree.

## 4. Build and test
- [ ] `eas build --profile preview --platform all` → install on **one low-end Android phone** (2–3 GB RAM) and one older iPhone.
- [ ] Low-end pass: Home, a full workout with the aura on, follow-along quick session, diary with 20+ foods, history, exercise library scroll. Target: no visible stutter, cold start under ~3 s.
- [ ] Test on a real device: barcode camera, voice coach, workout reminders at the chosen time, trial video upload, account deletion (then confirm the user is gone in Supabase Auth).
- [ ] TestFlight + Google Play internal testing with 10–20 people for one week.

## 5. Store submission
- [ ] Fill the listing, privacy labels, data-safety form and age rating from [STORE.md](STORE.md).
- [ ] Screenshots: 6.9″ and 6.5″ iPhone, Android phone (see STORE.md for the 6 scenes).
- [ ] Review notes: provide a demo account (onboarded, with a few workouts), and explain that A/S trial video review is optional.
- [ ] `eas submit --profile production` (fill `submit.production` in `eas.json` with your Apple team/ASC app id and Play service account).

## 5b. Known follow-ups before a policy change
- [x] **Re-consent:** built. Bump `CONSENT_VERSION` (`packages/contracts/src/profile.ts`) when the privacy policy or terms change in a way that needs new consent; onboarded users then see the consent screen before the app (`POST /me/consent`).
- [x] **Post–Sprint 9 audit:** community privacy/paging/counters, offline/session guards, AP/idempotency/nutrition safety (migration 0011). See `ARCHITECTURE.md` §12 sprint 9.5 and remaining gaps in `docs/HANDOFF.md`.
- [ ] Trial-video retention job (see the [DECIDE] in PRIVACY.md) if you promise a deletion window.
- [ ] Moderation queue UI in the web admin. The APIs are ready: `/progression/reviews` (trial videos) and `GET /community/moderation` + `POST /community/moderation/:type/:id` (posts/comments); reviewing now needs an API client.
- [ ] Community moderation: set `ANTHROPIC_API_KEY` on the API (Claude Haiku 5.5 classifier) and `MODERATOR_IDS`. Without the key, posts from new accounts wait for a moderator. Add a maintained slur list via `COMMUNITY_WORDLIST`.

## 6. Soft launch
- [ ] Release in 1–3 smaller markets first, then watch crash-free sessions (target ≥ 99.5%), D1/D7 retention and the first-workout rate for two weeks before a wider launch.
- [ ] Moderators assigned (`MODERATOR_IDS`) before the first A/S trial can happen (level 60+; weeks away for any new user).
