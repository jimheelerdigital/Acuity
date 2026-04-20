# Acuity — App Store Privacy Nutrition Label

**Target app:** Acuity Daily (`com.heelerdigital.acuity`)
**Status as of 2026-04-20:** Answer key for App Store Connect's privacy questionnaire. Copy values into the App Store Connect → App Privacy section when Jim submits.
**Source of truth:** the web app's `/privacy` page + `SECURITY_AUDIT.md`. Any change to what data Acuity collects/uses MUST update this doc too.

---

## Questionnaire framing

Apple's privacy questionnaire is structured per data type:

1. **Is the data collected?** (Yes/No)
2. If yes: **Is it linked to the user's identity?**
3. If yes: **Is it used to track the user across other companies' apps/websites?**
4. If yes: **What is it used for?** (pick from Apple's fixed purpose list)

Apple's purpose list:
- App Functionality
- Analytics
- Product Personalization
- Developer's Advertising or Marketing
- Third-Party Advertising
- Other Purposes

---

## Data-type-by-data-type

### Audio Data

| Question | Answer |
|---|---|
| Collected? | **Yes** |
| Linked to user? | **Yes** (tied to the signed-in account) |
| Used to track? | **No** |
| Purposes | App Functionality |

**Extended notes (for internal record, not shown in App Store):**
Voice recordings uploaded when the user taps Record. Stored in a private Supabase Storage bucket, transcribed by OpenAI Whisper, and deleted after transcription completes. Never shared with third parties beyond the transcription provider. Deleted on account deletion.

### User Content (text — transcripts + extracted signals)

| Question | Answer |
|---|---|
| Collected? | **Yes** |
| Linked to user? | **Yes** |
| Used to track? | **No** |
| Purposes | App Functionality |

Transcripts of the user's voice entries + the AI-extracted fields (summary, mood, themes, wins, blockers, tasks, goals, life-area mentions) stored in Postgres keyed to the user id. Used to render the user's own dashboard, weekly report, Life Audit. Not used for anything else. Not shared. Deleted on account deletion.

### Email Address

| Question | Answer |
|---|---|
| Collected? | **Yes** |
| Linked to user? | **Yes** |
| Used to track? | **No** |
| Purposes | App Functionality, Developer's Advertising or Marketing |

Sign-in identifier. Also used for product emails (weekly report delivery, Day 14 Life Audit notification, account-event emails). The "Developer's Advertising or Marketing" purpose covers launch announcements + the pre-launch drip, which the user opts into by joining the waitlist. No third-party marketing platforms receive the email.

### Name

| Question | Answer |
|---|---|
| Collected? | **Yes** |
| Linked to user? | **Yes** |
| Used to track? | **No** |
| Purposes | App Functionality, Product Personalization |

Pulled from the user's Google profile on OAuth sign-in. Used to personalize the greeting ("Good evening, Jim") and the email "from" name on outbound transactional emails. Not shared with third parties.

### Photos (profile image)

| Question | Answer |
|---|---|
| Collected? | **Yes** |
| Linked to user? | **Yes** |
| Used to track? | **No** |
| Purposes | App Functionality |

Google profile image URL (just the URL, not a re-hosted copy). Shown on the profile tab.

### Sensitive Info (mood, themes, mental-health-adjacent text)

| Question | Answer |
|---|---|
| Collected? | **Yes** |
| Linked to user? | **Yes** |
| Used to track? | **No** |
| Purposes | App Functionality |

The nature of voice-journaling is that users may discuss mental-health topics. Apple's "Sensitive Info" category specifically lists "racial or ethnic data, sexual orientation, pregnancy or childbirth information, disability, religious or philosophical beliefs, trade union membership, political opinion, genetic information, or biometric data" — none of which Acuity asks for directly. But transcripts may contain user-volunteered sensitive content. **Best-practice answer is to disclose this.**

### Usage Data

| Question | Answer |
|---|---|
| Collected? | **Yes** |
| Linked to user? | **Yes** (PostHog keyed by user id) |
| Used to track? | **No** |
| Purposes | Analytics, Product Personalization |

PostHog events: onboarding step completion, recording counts, paywall views, subscription lifecycle. Every event passes through the `safeLog` sanitizer — emails are hashed to 8-char sha256 prefix, transcript/name/audio fields are redacted. No third-party ad network receives this.

### Diagnostics

| Question | Answer |
|---|---|
| Collected? | **Yes** |
| Linked to user? | **No** (diagnostics logs are not tied to user id, but they pass through Vercel's logging layer which may correlate IPs) |
| Used to track? | **No** |
| Purposes | App Functionality, Analytics |

Vercel function logs (request duration, error stack traces, status codes). No logs of request bodies that would contain transcripts.

### Purchase History (Stripe)

| Question | Answer |
|---|---|
| Collected? | **Yes** |
| Linked to user? | **Yes** |
| Used to track? | **No** |
| Purposes | App Functionality |

Stripe customer ID + subscription status stored on the User row. Used to gate paywall features.

### Payment Info

| Question | Answer |
|---|---|
| Collected? | **No** (handled entirely by Stripe; Acuity never sees card numbers) |

**Important for App Store review:** payment collection happens on the web (getacuity.io/upgrade) via Stripe Checkout. The iOS app itself contains no payment UI.

---

## What Acuity does NOT collect

Explicitly disclose these as "Not Collected" in the questionnaire to keep the nutrition label honest:

- **Location (precise or coarse)** — Not Collected. No location APIs called.
- **Contacts** — Not Collected. No contacts-permission request.
- **Search History** — Not Collected.
- **Browsing History** — Not Collected.
- **Health & Fitness** — Not Collected as a data type (Acuity doesn't use HealthKit). Mood tracking is user-volunteered free text, disclosed under Sensitive Info + User Content.
- **Financial Info beyond Stripe customer ID** — Not Collected.
- **Advertising Data / Device IDs (IDFA)** — Not Collected. App does not use the AdSupport framework.
- **Other Diagnostic Data** — Not Collected beyond what's noted under Diagnostics.

---

## Answer checklist for the App Store Connect questionnaire

For every data type Apple asks about, Acuity's answer is one of:

**Collected + Linked + Not-Tracking + [App Functionality / Analytics / Personalization / Marketing]:**
- Audio Data — App Functionality
- User Content — App Functionality
- Email Address — App Functionality + Marketing
- Name — App Functionality + Personalization
- Photos (profile image) — App Functionality
- Sensitive Info — App Functionality
- Usage Data — Analytics + Personalization
- Purchase History — App Functionality

**Collected + Not Linked + Not-Tracking + App Functionality:**
- Diagnostics

**Not Collected:**
- Location
- Contacts
- Search History
- Browsing History
- Health & Fitness (HealthKit)
- Financial Info (beyond Stripe customer id, which is Purchase History)
- Advertising Data / IDFA
- All other device ids

---

## Third-party data flow (informational — not asked by Apple but referenced in /privacy)

| Recipient | What flows | Purpose | Data-residency |
|---|---|---|---|
| **OpenAI** (Whisper) | Audio file | Transcription | US |
| **Anthropic** (Claude) | Transcript | Extraction, weekly report, Life Audit | US |
| **Supabase** | Audio file (temp), account data | Storage, Postgres | US-West-2 |
| **Stripe** | Email, customer id, subscription status | Billing | US |
| **Resend** | Email | Transactional + drip emails | US |
| **Vercel** | HTTPS request/response | Hosting | US |
| **Inngest** | Event payloads (no audio or full transcript) | Background job orchestration | US |
| **PostHog** | Sanitized usage events (hashed email) | Analytics | US (PostHog Cloud US) |
| **Google** (OAuth, GA, AdSense domain assoc.) | Email, OAuth token | Sign-in + site analytics | US |
| **Meta** (Pixel) | Anonymous page views on marketing site | Ad campaign attribution | US |

All processors have no-training clauses for user content. Full list + privacy-policy links on `/privacy`.
