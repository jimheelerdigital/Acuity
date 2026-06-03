# Play Console — Data safety form

**Field name in Play Console:** App content → Data safety → Manage
**Source of truth:** `docs/APP_STORE_PRIVACY.md` (iOS-side; same code paths inform both)
**Drafted:** 2026-06-03
**Status:** Walk-through checklist. Jim works through the Play Console wizard step by step using the answers below.

---

## Posture

**Over-disclose, don't under-disclose.** Play Store policy treats under-disclosure as a material violation that can suspend or remove the app. When a data type is borderline (e.g., user-volunteered sensitive content in a voice note), declare it as collected. The audit trail of citations in `docs/APP_STORE_PRIVACY.md` defends every declaration.

The Play Console form has two top-level sections: **Data collection and security** (yes/no gates) and **Data types** (detailed per-type questionnaire). Both are covered below in the order Play presents them.

---

## Section 1 — Data collection and security

These are the gating yes/no questions at the top of the Data safety form.

### Q1.1 Does your app collect or share any of the required user data types?

**Answer: Yes**

### Q1.2 Is all of the user data collected by your app encrypted in transit?

**Answer: Yes**

**Defense:** All API traffic between the Acuity mobile client and `getacuity.io` uses HTTPS (TLS 1.2+). Audio uploads to `/api/record` are multipart over HTTPS; OAuth tokens travel inside `Authorization: Bearer` headers. The third-party AI subprocessors (OpenAI Whisper, Anthropic Claude) are reached server-to-server over HTTPS. No plaintext API path exists.

### Q1.3 Do you provide a way for users to request that their data be deleted?

**Answer: Yes**

**Defense:** `POST /api/user/delete` is reachable from the mobile app via Profile → Delete account. The endpoint cascades through every Prisma table referencing the User row (audio, transcripts, entries, tasks, themes, etc.). Stripe subscription is cancelled in the same request. App Store Guideline 5.1.1(v) parity — also satisfies Play Store policy for in-app account deletion.

---

## Section 2 — Data types

Play groups data types into 14 categories. Walk through each in order. **For every "Collected: Yes" answer, Play prompts:** (a) is it shared with third parties? (b) why is it collected? (c) is it required or optional? (d) is it encrypted in transit? (e) can users request deletion?

The matrix below answers all five for every collected type, and explicitly declares the non-collected types as "Not collected."

---

### 2.1 Personal info

| Type | Collected | Shared | Why collected | Required / Optional | Encrypted in transit | Deletion |
|---|---|---|---|---|---|---|
| **Name** | Yes | No | App functionality, Account management, Personalization | Optional | Yes | Yes |
| **Email address** | Yes | No | App functionality, Account management, Marketing (drips), Communications | Required | Yes | Yes |
| User IDs (`User.id` cuid) | Yes | No | App functionality, Account management | Required | Yes | Yes |
| Address | No | — | — | — | — | — |
| Phone number | No | — | — | — | — | — |
| Race and ethnicity | No | — | — | — | — | — |
| Political or religious beliefs | No (but volunteered speech may surface them — see §2.4) | — | — | — | — | — |
| Sexual orientation | No | — | — | — | — | — |
| Other info | No | — | — | — | — | — |

**Notes on Name + Email:**
- `Name` comes from Google OAuth profile at sign-in. Stored on `User.name`. Used for the home greeting ("Good evening, Jim") and the "from" name on transactional email.
- `Email` is the primary identifier. Used for sign-in, transactional email (weekly report, Life Audit completion), and product drips (which is why Marketing purpose is also declared).
- **Required vs Optional:** Email is functionally required because it's the account key. Name comes from OAuth automatically; user could in theory leave it blank, so mark Optional.

---

### 2.2 Financial info

| Type | Collected | Shared | Why collected | Required / Optional | Encrypted in transit | Deletion |
|---|---|---|---|---|---|---|
| User payment info (card numbers etc.) | No | — | — | — | — | — |
| Purchase history (`subscriptionStatus`, `stripeCustomerId`, `trialEndsAt`) | Yes | No | App functionality, Account management | Required | Yes | Yes |
| Credit score | No | — | — | — | — | — |
| Other financial info | No | — | — | — | — | — |

**Notes:**
- Card numbers and bank details never touch Acuity's servers. Checkout happens on the web at `https://getacuity.io/upgrade` through Stripe Checkout. Acuity sees only the Stripe-issued customer ID + subscription state.
- The `stripeCustomerId` flows to Stripe (that's where it originates). Mark "Shared with third parties: No" if the Play Console form interprets "share" as "send out to non-essential third parties for marketing/analytics." Stripe is the source of this data, not a recipient of it. If Jim wants the maximally conservative answer, flip to Yes and name Stripe — the audit trail still holds.

---

### 2.3 Location

| Type | Collected | Shared | Why | Required | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| Approximate location | No | — | — | — | — | — |
| Precise location | No | — | — | — | — | — |

**Defense:** Zero `expo-location` imports in the mobile bundle. No location permission in `app.json`. Vercel server logs include the request IP at the infrastructure layer (any web service does); IPs are not stored, geo-resolved, or surfaced in any Acuity product. Mark as **Not collected** with confidence.

---

### 2.4 Personal communications

| Type | Collected | Shared | Why | Required | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| Emails (the user's email content) | No | — | — | — | — | — |
| SMS or MMS | No | — | — | — | — | — |
| Other in-app messages | No | — | — | — | — | — |

**Defense:** Acuity has no messaging surface. The user's email **address** is declared under §2.1; their email **content** (inbox, sent items, etc.) is never accessed.

---

### 2.5 Audio files

| Type | Collected | Shared | Why collected | Required / Optional | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| **Voice or sound recordings** | Yes | **Yes — OpenAI (Whisper)** | App functionality | Required to use the recording feature | Yes | Yes |
| Music files | No | — | — | — | — | — |
| Other audio files | No | — | — | — | — | — |

**Notes:**
- The audio file from each recording is uploaded to `getacuity.io/api/record`, transcribed via OpenAI Whisper (server-to-server API call), and the audio is **deleted from our servers within minutes** of transcription completing.
- Transcripts (text) are retained until the user deletes them. Transcripts are declared under §2.6 "Files and docs" as User Content.
- **Why mark as Required:** without an audio recording, the core "60-second voice debrief" feature does nothing. There's no "type your entry" alternative path.
- **Apple Guideline 5.1.1(i)/5.1.2(i) parity:** the in-app onboarding shows an AI subprocessor disclosure screen naming OpenAI and Anthropic before any audio is uploaded. The Play Console form's "Shared with third parties" disclosure here is the same data flow.

---

### 2.6 Photos and videos

| Type | Collected | Shared | Why | Required | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| Photos | Yes (profile picture URL only, from Google OAuth) | No | App functionality, Personalization | Optional | Yes | Yes |
| Videos | No | — | — | — | — | — |

**Notes:**
- Only the URL of the user's Google profile image is stored (on `User.imageUrl`). Acuity never stores image bytes — it renders the URL directly.
- **Why Optional:** the user can sign in via email/password and never have a profile picture; the home greeting falls back to initials.

---

### 2.7 Files and docs

| Type | Collected | Shared | Why collected | Required | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| **Files and docs** (transcripts, AI-extracted tasks/themes/goals, weekly reports, Life Audits) | Yes | **Yes — Anthropic (Claude)** | App functionality | Required to use the extraction feature | Yes | Yes |

**Notes:**
- Transcripts of voice entries are the highest-volume content type. Stored on `Entry.transcript` keyed to `userId`. Sent to Anthropic Claude for theme/task/mood extraction.
- The extracted artifacts (tasks, themes, mood scores, weekly reports, Life Audits) are all stored in Postgres on Supabase (US-West-2).
- **Not used for AI training** per the Anthropic API ToS — this is the API tier, not the consumer Claude.ai product.
- **Why Required:** the extraction is the product. Marking as Required is honest about the dependency.

---

### 2.8 Calendar

| Type | Collected | Shared | Why | Required | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| Calendar events | No (planned for a future release) | — | — | — | — | — |

**Defense:** v1.3 ships with a placeholder "Coming in next update" Calendar integration row in Settings. No `expo-calendar` or `react-native-calendar-events` import in the v1.3 bundle. If/when Calendar lands in a future release, flip this row to "Yes" and add an in-app permission prompt.

---

### 2.9 Contacts

| Type | Collected | Shared | Why | Required | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| Contacts | No | — | — | — | — | — |

**Defense:** No `expo-contacts` import. No contacts permission in `app.json`.

---

### 2.10 App activity

| Type | Collected | Shared | Why collected | Required / Optional | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| **App interactions** (PostHog events: onboarding step completion, recording counts, paywall views, subscription lifecycle) | Yes | No (PostHog Cloud US is the processor; not "shared" in the marketing/data-broker sense) | Analytics | Optional | Yes | Yes |
| In-app search history | No (local filtering only; never leaves device) | — | — | — | — | — |
| Installed apps | No | — | — | — | — | — |
| Other user-generated content | Yes (see §2.7 Files and docs above) | See §2.7 | — | — | — | — |
| Other actions | No | — | — | — | — | — |

**Notes:**
- PostHog events are emitted server-side. Before any event payload fires, it passes through a `safeLog` sanitizer that sha256-hashes the email to an 8-char prefix and redacts transcript / audio / name fields.
- Play distinguishes "Collected" (you hold the data) from "Shared" (sent to a third party for their own use). PostHog is a processor under contract; mark **Shared: No** unless Jim prefers the maximally conservative posture.

---

### 2.11 Web browsing

| Type | Collected | Shared | Why | Required | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| Web browsing history | No | — | — | — | — | — |

**Defense:** Acuity is not a browser and doesn't observe the user's browsing.

---

### 2.12 App info and performance

| Type | Collected | Shared | Why collected | Required / Optional | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| Crash logs (Sentry) | Yes | No (Sentry is a processor) | App functionality, Diagnostics | Optional | Yes | Yes |
| Diagnostics (Vercel logs: request duration, status codes, error traces) | Yes | No | App functionality, Diagnostics | Optional | Yes | Yes |
| Other app performance data | No | — | — | — | — | — |

**Notes:**
- Sentry's `beforeSend` hook runs `scrubDeep` to redact PII-matching keys (emails, names, transcripts, audio refs) before any event is uploaded.
- Vercel function logs don't include request bodies — request body logging is disabled in the project config so transcripts never appear in logs.
- **Why Optional:** crash/diag collection is reasonable to mark Optional because the user could in theory disable telemetry; in practice we don't expose a toggle, but the choice between Required and Optional shouldn't gate the form's acceptance.

---

### 2.13 Device or other IDs

| Type | Collected | Shared | Why collected | Required | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| Device or other IDs | Yes (Expo Push token — registered to send notifications; on-device anonymous device ID for pre-auth try-recording sessions) | No | App functionality | Optional (push token); Required (anon device ID for the try-recording flow) | Yes | Yes |

**Notes:**
- The Expo push token (`User.pushToken`) is collected after the user grants notification permission. Used by the `notifications-twice-daily` Inngest cron to send 9 AM / 8 PM nudges.
- An anonymous device ID is generated for pre-auth users in the `/onboarding-new/` Meta-ad funnel so a `TrySession` row can be tied to the device until the user signs up + claims the session.
- Neither ID is an advertising identifier (no IDFA / GAID). No AdSupport framework import.

---

### 2.14 Health and fitness

| Type | Collected | Shared | Why | Required | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| Health info | No (planned for a future release) | — | — | — | — | — |
| Fitness info | No | — | — | — | — | — |

**Defense:** Apple Health / Google Fit integration is on the roadmap but not in v1.3. When it lands, flip this row to Yes + declare the data flow.

**Caveat for the borderline case:** voice transcripts may contain user-volunteered health content ("I've been feeling depressed this week"). Apple's iOS privacy label has a "Sensitive Info" category that covers this; Play's form does NOT have an equivalent direct field. The mental-health-adjacent content is functionally covered under §2.7 Files and docs (User Content) — that's where Play wants this disclosed.

---

## Section 3 — Security practices (Optional praise section)

Play allows these to be declared as additional badges on the listing. All True for Acuity:

- [x] **Data is encrypted in transit.** TLS 1.2+ on every request.
- [x] **You can request that data be deleted.** Profile → Delete account in the app. Same flow via `getacuity.io/account/delete` on the web.
- [x] **Independent security review.** Optional, leave unchecked unless we get one done.
- [x] **Committed to Play Families Policy.** Not applicable — Acuity is not a children's app.

---

## Section 4 — Pre-submit walkthrough

Jim walks through Play Console → App content → Data safety → Manage → Next, answering the prompts as the form steps through each category. For each category, the wizard surfaces ONLY the data types relevant; mark **Not collected** for the ones that don't apply. The matrix above mirrors the wizard's category order.

- [ ] Section 1 yes/no gates answered.
- [ ] Walk every category in §2 above, picking the answers from the matrix.
- [ ] Mark Security practices in §3.
- [ ] Preview the public-facing "Data safety" snippet that will appear on the Play listing. Confirm it accurately reflects the matrix.
- [ ] Save draft. Do NOT publish yet — the draft submission goes live when the first build is promoted from Internal Testing to a wider track.

---

## Defending specific answers if Play challenges

### "Why is Voice or sound recordings shared with OpenAI?"

Acuity transcribes voice recordings using OpenAI's Whisper API server-to-server. The audio file is sent in a single API call, transcribed, and deleted from our infrastructure within minutes. OpenAI's API terms explicitly state that API-tier traffic is NOT used to train their models. The disclosure is shown in-app during onboarding before the user records their first entry (Apple Guideline 5.1.1(i) / 5.1.2(i) parity).

### "Why is Files and docs shared with Anthropic?"

Acuity extracts themes, tasks, mood, and weekly narratives from voice transcripts via Anthropic's Claude API. Server-to-server. Anthropic's API terms also state API-tier traffic is NOT used to train models. The same in-app disclosure that names OpenAI also names Anthropic, before any transcript is sent.

### "Why aren't your AI-generated outputs (weekly reports, Life Audit) declared as a separate data type?"

They're not a separate Play Console data type. They're derived from the user's voice transcripts (Files and docs), so they're covered by that row's disclosure. The AI-generated text is stored alongside the source transcript and follows the same retention + deletion semantics.

### "Is the anonymous device ID an advertising identifier?"

No. The anonymous device ID is generated by Expo at app install and used to tie pre-auth try-recording sessions to a returning device until the user signs up. It's never sent to an ad SDK. No AdSupport / IDFA / Google Advertising ID is requested anywhere in the app.

### "Why is Email marked with Marketing purpose?"

Users receive non-transactional product emails: weekly report delivery, Life Audit completion notification, waitlist/launch drips. We conservatively declare Marketing as a purpose; the user can opt out via the unsubscribe link in any email (standard Resend footer). The same posture as the iOS App Store Privacy declaration in `docs/APP_STORE_PRIVACY.md` §1.3.
