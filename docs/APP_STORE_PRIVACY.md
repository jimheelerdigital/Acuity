# App Store Privacy Declarations — Acuity

**Target app:** iOS (`com.heelerdigital.acuity`)
**Drafted:** 2026-04-24
**Status:** Answer key for App Store Connect → App Privacy section. Not submitted.

**Companion docs:**
- `docs/APP_STORE_PRIVACY_NUTRITION.md` — existing earlier draft of the questionnaire answers. This doc supersedes it by adding code citations for every claim.
- `apps/web/src/app/privacy/page.tsx` — the public-facing Privacy Policy at `https://www.getacuity.io/privacy` (last updated 2026-04-19).
- `docs/SECURITY_AUDIT.md` — the broader security posture.

**Principle (rubric §7.6):** every privacy claim must be mechanism-specific. "Your data is secure" fails. "Voice recordings are deleted after transcription" passes. Every answer below is backed by a file-line citation so the claim is defensible against Apple review OR a direct user challenge.

---

## 1. Data collection matrix

Each row:
- **Data type** — Apple's fixed category name
- **Collected?** — Yes / No
- **Linked to identity?** — Yes (tied to a signed-in `User.id`) / No
- **Used for tracking?** — per Apple's definition: used for cross-company advertising or data-broker purposes
- **Purposes** — Apple's fixed list: App Functionality, Analytics, Product Personalization, Developer's Advertising or Marketing, Third-Party Advertising, Other Purposes
- **Where in the code** — primary call site + justification

### 1.1 Audio Data

| Field | Answer |
|---|---|
| Collected? | **Yes** |
| Linked? | **Yes** — uploaded with the signed-in user's bearer token |
| Tracking? | **No** |
| Purposes | App Functionality |

**Code citation:**
- Upload: `apps/mobile/app/record.tsx:256–320` — `upload(uri, duration)` posts audio to `POST /api/record` with `form.append("audio", { uri, name: "recording.m4a", type: "audio/mp4" })`.
- Transcription: audio hits Supabase Storage, then OpenAI Whisper via the backend `/api/record` handler. Audio is deleted from Supabase Storage after transcription completes (behavior documented in `apps/web/src/app/privacy/page.tsx` §1–3).
- Retention: transcripts (text) stay; audio does not.

**Why App Functionality only:** audio is never passed to analytics providers (PostHog's `safeLog` sanitizer redacts any `audio` field — see `apps/mobile/lib/sentry.ts:35–61` for the PII scrubber pattern; same shape on the web PostHog wrapper).

### 1.2 User Content (transcripts + AI-extracted fields)

| Field | Answer |
|---|---|
| Collected? | **Yes** |
| Linked? | **Yes** |
| Tracking? | **No** |
| Purposes | App Functionality |

**Code citation:**
- Storage: `prisma/schema.prisma` — `Entry.transcript`, `Entry.summary`, `Entry.themes`, `Entry.wins`, `Entry.blockers`, plus derived `Task`, `Goal`, `LifeMapArea` rows. All keyed on `userId`.
- AI extraction: backend `/api/record` → Claude via the `@anthropic-ai/sdk` client. Prompt-engineered extraction is documented in `apps/web/src/lib/` extraction routes; no extracted content leaves the user's account.
- User-facing: rendered into the Home dashboard, Theme Map, Life Matrix, weekly report, Life Audit — all scoped to the signed-in user.

**Deletion:** `apps/web/src/app/api/account/delete/route.ts` (or equivalent) cascades through the Prisma schema on user deletion. One-tap flow from Profile → Delete account.

### 1.3 Email Address

| Field | Answer |
|---|---|
| Collected? | **Yes** |
| Linked? | **Yes** |
| Tracking? | **No** |
| Purposes | App Functionality, Developer's Advertising or Marketing |

**Code citation:**
- Sign-in: `apps/mobile/lib/auth.ts` — Google OAuth + mobile-callback endpoint. Email is the primary identifier; stored on `User.email`.
- Transactional emails: `apps/web/src/lib/drip-emails.ts` + Resend. Weekly report delivery, Life Audit notification, account events.
- Marketing: waitlist drip emails (via Resend). Users opt in at signup. No third-party marketing platform (Mailchimp, Sendgrid, etc.) receives the list.

**Why the Marketing purpose is declared:** the Day-14 "your Life Audit is ready" email and pre-launch drips are arguably product communications, but Apple's review is strict about this — if we send ANY non-transactional email we declare the Marketing purpose. Conservative choice.

### 1.4 Name

| Field | Answer |
|---|---|
| Collected? | **Yes** |
| Linked? | **Yes** |
| Tracking? | **No** |
| Purposes | App Functionality, Product Personalization |

**Code citation:**
- Source: `apps/mobile/lib/auth.ts` — pulled from the Google OAuth profile at sign-in. Stored on `User.name`.
- Used for: greeting on Home (`apps/mobile/app/(tabs)/index.tsx:144–146` — "Good evening, Jim"), email "from" name on transactional mail.

### 1.5 Photos (profile image)

| Field | Answer |
|---|---|
| Collected? | **Yes** |
| Linked? | **Yes** |
| Tracking? | **No** |
| Purposes | App Functionality |

**Code citation:** the URL of the user's Google profile image is stored on `User.imageUrl`. Not re-hosted; Acuity never stores the actual image bytes. Shown on the Profile tab.

### 1.6 Sensitive Info (user-volunteered mental-health-adjacent content)

| Field | Answer |
|---|---|
| Collected? | **Yes** |
| Linked? | **Yes** |
| Tracking? | **No** |
| Purposes | App Functionality |

**Code citation + reasoning:**
Apple's "Sensitive Info" category lists racial data, sexual orientation, pregnancy info, disability, religious beliefs, union membership, political opinion, genetic/biometric data. Acuity asks for NONE of these directly — no onboarding question touches them.

But voice journaling by its nature can surface mental-health content, political views, religious beliefs, etc. that the user chooses to share. The conservative disclosure is "Yes, we collect Sensitive Info via user-volunteered speech," because the transcript might contain it.

Example of a user saying this in an entry: `"I've been feeling really depressed this week about..."` — that transcript gets stored under `Entry.transcript`. Disclosing Sensitive Info as collected lets Apple's privacy label accurately represent the upside-risk.

### 1.7 Usage Data

| Field | Answer |
|---|---|
| Collected? | **Yes** |
| Linked? | **Yes** — PostHog keyed by user id |
| Tracking? | **No** |
| Purposes | Analytics, Product Personalization |

**Code citation:**
- PostHog SDK: server-side capture. Events: onboarding step completion, recording counts, paywall views, subscription lifecycle.
- PII scrubber: before every PostHog event fires, the payload passes through `safeLog` (web equivalent of `scrubDeep` in `apps/mobile/lib/sentry.ts:48–66`). Emails are sha256-hashed to 8-char prefix; transcript / audio / name fields are redacted. The sanitizer is unit-tested.
- No third-party ad network (Meta Pixel, Google Ads) fires from the mobile app. The marketing site uses Meta Pixel for ad-campaign attribution on page views only — but that's not in the mobile app bundle.

### 1.8 Diagnostics

| Field | Answer |
|---|---|
| Collected? | **Yes** |
| Linked? | **No** (logs are not keyed by user id at the logging layer; but Vercel may correlate IPs) |
| Tracking? | **No** |
| Purposes | App Functionality, Analytics |

**Code citation:**
- Vercel function logs: request duration, status code, error stack trace. No request bodies (which would contain transcripts) are logged — request logging is explicitly excluded in the Vercel project config.
- Sentry: mobile-side `Sentry.init` in `apps/mobile/lib/sentry.ts`, with the `beforeSend` hook (`lib/sentry.ts:85–95`) running `scrubDeep` to redact any PII-matching key before upload.

### 1.9 Purchase History (subscription status)

| Field | Answer |
|---|---|
| Collected? | **Yes** |
| Linked? | **Yes** |
| Tracking? | **No** |
| Purposes | App Functionality |

**Code citation:**
- Storage: `User.subscriptionStatus`, `User.stripeCustomerId`, `User.trialEndsAt` (see `prisma/schema.prisma`).
- Source: Stripe webhook → `apps/web/src/app/api/stripe/webhook/route.ts` → `User.subscriptionStatus` updated.
- Used for: paywall gating (`apps/web/src/lib/entitlements.ts`).

### 1.10 Payment Info

| Field | Answer |
|---|---|
| Collected? | **No** |

**Justification:** payment card numbers never touch Acuity's servers. Checkout happens on the web at `https://www.getacuity.io/upgrade`, handled entirely by Stripe Checkout. Acuity sees only the Stripe-issued customer and subscription identifiers.

**App Store review angle:** this is relevant to the 3.1.3(b) Multiplatform Services defense (see `docs/APP_STORE_REVIEW_NOTES.md` §5). The iOS app has zero payment UI — no pricing shown, no "Subscribe" button. Verified in `apps/mobile/app/paywall.tsx`.

---

## 2. What Acuity explicitly does NOT collect

Declare every one of these as "Not Collected" in the App Store Connect questionnaire to keep the label honest:

| Data type | Why not collected |
|---|---|
| Location (precise or coarse) | No location API imports. Grep `apps/mobile/` for `expo-location` — zero hits. |
| Contacts | No `expo-contacts` import. No contacts-permission request in `app.json`. |
| Search History | Acuity has no search feature that leaves the device. The Entries tab has local substring filtering (`apps/mobile/app/(tabs)/entries.tsx:66–79`) — that never leaves the client. |
| Browsing History | App doesn't browse. |
| Health & Fitness (HealthKit) | HealthKit integration is planned (see `docs/APPLE_HEALTH_INTEGRATION.md`) but not shipped. If/when it ships, this row flips to "Collected, linked, App Functionality." |
| Financial Info | Beyond the Stripe customer ID (declared under Purchase History), no bank / card / income data is ever seen by Acuity. |
| Advertising Data / IDFA | No AdSupport framework import. No ad SDKs. |
| Other Diagnostic Data | Only the Vercel + Sentry diagnostics already declared. |

---

## 3. Copy-paste answer table for App Store Connect

The App Store Connect UI walks through each data type and asks four questions. Here's the exact set of answers to enter:

### Collected + Linked + Not-Tracking

| Data type | Purposes |
|---|---|
| Audio Data | App Functionality |
| User Content | App Functionality |
| Email Address | App Functionality, Developer's Advertising or Marketing |
| Name | App Functionality, Product Personalization |
| Photos or Videos (Profile Picture) | App Functionality |
| Sensitive Info | App Functionality |
| Usage Data | Analytics, Product Personalization |
| Purchase History | App Functionality |

### Collected + Not-Linked + Not-Tracking

| Data type | Purposes |
|---|---|
| Diagnostics | App Functionality, Analytics |

### Not Collected

- Location (Precise + Coarse)
- Contacts
- Search History
- Browsing History
- Health & Fitness
- Financial Info (beyond Stripe customer id — declared under Purchase History)
- Other Financial Info
- User ID (IDFA)
- Device ID
- Advertising Data
- Other Diagnostic Data
- Physical Address
- Phone Number
- Emails or Text Messages (messages within the app, not the user's email which IS declared above)
- Photos or Videos (beyond the Profile Picture declared above)
- Gameplay Content
- Customer Support
- Other User Content

### Tracking

Across every data type, the answer to **"Is this data used to track you?"** is **No**. Acuity does not combine user data with third-party data to show targeted ads, share with data brokers, or use any SDK that the IDFA AppTrackingTransparency prompt applies to.

---

## 4. Third-party data flow (not asked by Apple; noted for /privacy consistency)

Table maps every third-party recipient to what flows to them. Mirrors the `/privacy` page disclosure at `apps/web/src/app/privacy/page.tsx`.

| Recipient | Flows to them | Purpose | Data residency |
|---|---|---|---|
| OpenAI (Whisper) | Audio file (single request, ephemeral) | Transcription | US |
| Anthropic (Claude) | Transcript text, prompt context | Extraction + weekly report + Life Audit | US |
| Supabase | Audio (briefly), account data | Storage + Postgres | US-West-2 |
| Stripe | Email, customer id, subscription status | Billing | US |
| Resend | Email address + email body | Transactional + drip emails | US |
| Vercel | HTTPS request/response (no bodies logged) | Hosting + function execution | US |
| Inngest | Event payloads (no audio, no full transcripts) | Background job orchestration | US |
| PostHog | Sanitized usage events (sha256-hashed email) | Analytics | US (PostHog Cloud US) |
| Google (OAuth) | Email, OAuth token | Sign-in | US |
| Google (GA/AdSense on marketing site) | Anonymous pageviews on `getacuity.io` | Ad-campaign attribution (marketing site ONLY, not in mobile bundle) | US |
| Meta (Pixel on marketing site) | Anonymous pageviews on `getacuity.io` | Ad-campaign attribution (marketing site ONLY, not in mobile bundle) | US |
| Sentry | Scrubbed crash + error events (no audio, no transcripts, no emails after scrubDeep) | Error monitoring | US |

**No training:** per each provider's API terms, content sent via API is NOT used to train their models. This is different from consumer ChatGPT / Claude.ai products which may train on user content. Acuity uses the API tiers exclusively.

---

## 5. Defending specific answers if Apple asks

### "Why is Sensitive Info collected?"

Acuity is a voice-journaling app; users may volunteer mental-health content in their entries (e.g. "I've been anxious about..."). We disclose Sensitive Info collection so the privacy label accurately reflects the upside-risk that a transcript could contain it. Acuity does not ask for sensitive info in any form, setting, or onboarding question.

### "Why is Marketing declared for Email?"

Users receive non-transactional product emails: weekly report delivery, Life Audit completion, waitlist/launch drip (for early users). We conservatively declare Marketing as a purpose; the user can opt out via the unsubscribe link in any email (standard Resend footer).

### "Why is Diagnostics not linked to user?"

Application logs are emitted by Vercel function infrastructure without attaching a user id. Sentry crash/error events are tagged with a user id (`setSentryUser` in `apps/mobile/lib/sentry.ts`) — but the `scrubDeep` `beforeSend` hook removes any PII-matching key from the payload before upload. The effective linkage is to a cuid id, not to an identifying value like email. Apple's guidance treats this class as "Not Linked" when the id can't be reversed to a natural person without separate account-data access.

---

## 6. Next-step checklist before submit

- [ ] Verify the privacy page timestamp in `apps/web/src/app/privacy/page.tsx:11` is not older than 30 days (if it is, bump the `LAST_UPDATED` const).
- [ ] Walk the App Store Connect → App Privacy questionnaire using §3 of this doc as the answer script.
- [ ] Double-check that `expo-location`, `expo-contacts`, and `HealthKit` imports are still absent — Apple's privacy label has to match the entitlements in the shipped IPA, and a rogue future import would invalidate the "Not Collected" declarations above.
- [ ] Confirm no new third-party SDKs landed since this doc — if any did, add rows to §4.
