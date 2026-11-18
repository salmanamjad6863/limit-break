# Auth: Email One-Time Code (Supabase)

Sign-in is **passwordless email OTP**. One flow for new and returning users: enter email → enter the code → signed in.
New accounts go through onboarding; returning accounts land on Home with their data from the server.

## Supabase dashboard settings (do these once)

**Authentication → Sign In / Providers**
- [ ] **Email** provider: on.
- [ ] **Allow new users to sign up**: on (the code screen creates the account on first sign-in).
- [ ] **Confirm email**: on. Entering the code *is* the confirmation.
- [ ] **Allow anonymous sign-ins**: **off**. The app no longer uses guest accounts, and the API rejects anonymous tokens anyway.
- [ ] **Allow manual linking**: off (not used).
- [ ] Email provider details: **Email OTP expiration = 600** seconds (10 minutes) and **Email OTP length = 6**.
  If you choose another length, set `EXPO_PUBLIC_OTP_LENGTH` in `apps/mobile/.env` to the same number.

**Authentication → Emails → Templates**: the emails must show the **code**, not only a link.
Put `{{ .Token }}` in **both** of these templates (new emails get "Confirm signup", existing ones get "Magic Link"):
- [ ] **Confirm signup**
- [ ] **Magic Link**

Suggested body (same for both):

```html
<h2>Your LIMITBREAK code</h2>
<p>Enter this code in the app to sign in:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>It expires in 10 minutes. If you didn't ask for it, ignore this email. Nobody from LIMITBREAK will ever ask you for this code.</p>
```

**Authentication → Emails → SMTP Settings**
- Supabase's built-in email is for testing only: very low hourly limit, and it **only delivers to addresses of members of your Supabase organization**. For your own testing, sign in with the email you use for Supabase.
- [ ] Before real users: add custom SMTP (for example Resend free tier, AWS SES or Postmark) and a sender on your own domain with SPF/DKIM set.

**Authentication → Rate Limits** (defaults are fine; check them)
- Emails sent per hour (raise after custom SMTP), token verifications per 5 minutes per IP, and token refreshes.

**Authentication → Sessions**
- [ ] **Detect and revoke compromised refresh tokens**: on (default). A refresh token used twice kills the session family.
- JWT expiry: keep 3600 s. The app refreshes in the foreground only.

**Authentication → Attack Protection** (before public launch)
- [ ] CAPTCHA (Cloudflare Turnstile or hCaptcha) on sign-up/sign-in, once a small native captcha view is added to the email step.

**Project Settings → JWT Keys**
- [ ] Asymmetric signing keys (ES256) in use. The API only accepts ES256/RS256 tokens from your project's JWKS.

## What the code does (security model)

| Layer | Protection |
|---|---|
| Sign-in | Email OTP only, no passwords stored or typed. 60 s resend cooldown, max 5 wrong codes per emailed code (then a new code is required), on top of Supabase's per-IP limits |
| Error messages | Generic. They never reveal whether an email already has an account (no account enumeration) |
| Session on the phone | Stored in MMKV encrypted with **AES-256**. The key is random per install and lives only in the iOS Keychain / Android Keystore (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: not in backups, not moved to another device). The same encryption covers all cached personal data (workouts, nutrition, query cache) |
| Account switching | When a different account signs in, the previous account's on-device data and cache are wiped first |
| Sign out | Revokes this device's refresh token on the server and wipes on-device data. "Sign out of all devices" revokes every session of the account. Unsynced offline changes are warned about before signing out |
| API | Every request needs a Bearer token verified against the project JWKS: ES256/RS256 only (no HS256, no `none`), issuer, audience `authenticated`, expiry, role `authenticated`, UUID subject, **not anonymous**. Tests: `apps/api/test/auth.test.ts` |
| Database | RLS on every table; the app never talks to tables directly, only through the API |

Code: `apps/mobile/src/features/session/` (auth, session listener), `apps/mobile/src/app/sign-in.tsx`, `apps/mobile/src/lib/storage.ts`, `apps/api/src/lib/auth.ts`.

## Test it locally
1. Apply the settings above (at least: anonymous off, OTP length 6, `{{ .Token }}` in both templates).
2. Run the API (`pnpm --filter @lb/api dev`) and the app.
3. Enter the email of your Supabase account → the code arrives → type it → onboarding.
4. Profile → Sign out → you're back on the sign-in screen, and on-device data is gone. Sign in again → Home loads your data from the server.
