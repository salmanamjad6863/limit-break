# Auth: Guest-first + Email One-Time Code (Supabase)

**Flow (PLAN.md §7)**
1. **First launch → guest.** The app starts a guest (anonymous) account automatically. Onboarding, workouts, nutrition, quests and ranks all work. No sign-up wall.
2. **Save your progress.** After the first workout, Home asks "Save your progress, Hunter" (also in Profile). The guest enters an email + the emailed code, and the **same account** becomes a saved account. Nothing is copied or migrated.
3. **Sign in.** A returning hunter on a new phone taps "I already have an account" on the first onboarding screen (or in Profile), enters their email + code, and their data loads from the server.
4. **Sign out** (saved accounts only) → the sign-in screen, with "Start as a new hunter" to continue as a fresh guest.
5. **Later:** Sign in with Apple / Google as extra buttons on the same screen (if Google is offered, Apple must be too).

Free features don't depend on the account type. Guests are flagged in the API (`isGuest`), so community features can require a saved account (`requireSavedAccount`), and subscriptions (later) can require one too.

## Supabase dashboard settings

**Authentication → Sign In / Providers**
- [ ] **Allow anonymous sign-ins: on** (guest mode).
- [ ] **Allow new users to sign up: on**.
- [ ] **Confirm email: on**. Entering the code is the confirmation.
- [ ] **Email**: OTP expiration **600** s, OTP length **6** (same as `EXPO_PUBLIC_OTP_LENGTH` in `apps/mobile/.env`).

**Authentication → Emails → SMTP Settings** (required: templates can only be edited with custom SMTP)
- [ ] Resend: host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key with sending access.
- [ ] Sender: `onboarding@resend.dev` for testing (delivers only to your Resend account email). Before real users: an address on your own verified domain, e.g. `noreply@mail.yourdomain.com`.

**Authentication → Emails → Templates**: put the code in these **three** templates and save each:
- [ ] **Magic link or OTP** (sign in to an existing account)
- [ ] **Confirm sign up** (first sign-in with a new email)
- [ ] **Change email address** (a guest saving their progress)

```html
<h2>Your LIMITBREAK code</h2>
<p>Enter this code in the app:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>It expires in 10 minutes. If you didn't ask for it, ignore this email. Nobody from LIMITBREAK will ever ask you for this code.</p>
```

**Authentication → URL Configuration**
- [ ] Site URL: `limitbreak://` (no email should ever open `localhost`).

**Authentication → Rate Limits**: check emails/hour (30 with custom SMTP), anonymous sign-ins per hour per IP, token verifications.

**Authentication → Sessions**: keep "Detect and revoke compromised refresh tokens" on.

**Before public launch**
- [ ] CAPTCHA (Cloudflare Turnstile) for anonymous sign-ins and email codes, to stop bots creating guest accounts.
- [ ] A weekly cleanup of abandoned guests (SQL editor → pg_cron), for example guests older than 30 days with no workouts:
  ```sql
  delete from auth.users u
  where u.is_anonymous and u.created_at < now() - interval '30 days'
    and not exists (select 1 from "WorkoutSession" w where w."userId" = u.id);
  ```

## Security model

| Layer | Protection |
|---|---|
| Codes | Email OTP, no passwords. 60 s resend cooldown, max 5 wrong codes per emailed code, plus Supabase per-IP limits. Sign-in errors never reveal whether an email has an account |
| Phone storage | Session + all cached personal data in MMKV encrypted with **AES-256**; random key per install, only in the iOS Keychain / Android Keystore (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: no backups, no device transfer) |
| Account switching | A different account signing in wipes the previous account's on-device data first. A guest saving progress keeps the same account, so nothing is wiped |
| Sign out | Revokes this device's refresh token and wipes on-device data; "Sign out of all devices" revokes every session; unsynced offline changes are warned about first. Guests can't sign out (it would destroy their only copy); they save or delete instead |
| API | ES256/RS256 only via the project JWKS (no HS256, no `none`), issuer, audience, expiry, role `authenticated`, UUID subject. Guests allowed and flagged; `requireSavedAccount` returns 403 for guests. Tests: `apps/api/test/auth.test.ts` |
| Database | RLS on every table; the app only talks to the API |

Code: `apps/mobile/src/features/session/` (auth helpers, session listener), `apps/mobile/src/app/sign-in.tsx`, `apps/mobile/src/lib/storage.ts`, `apps/api/src/lib/auth.ts`, `apps/api/src/middleware/auth.ts`.

## Test locally
1. Fresh install (or delete the app) → onboarding starts as a guest → finish it and log one workout.
2. Home shows "Save your progress" → enter your Resend account email → code → saved (same data, Profile shows "Signed in as …").
3. Profile → Sign out → sign-in screen → sign in with the same email → your data comes back.
