# Acuity — Subprocessor list and Data Processing Agreements

**Data controller:** Heeler Digital, LLC ("Acuity")
**Privacy contact:** privacy@heelerdigital.com
**Last updated:** 2026-06-03

This page lists every third-party service that processes personal
data of Acuity users on our behalf. It is published under our
contractual obligations to inform customers of subprocessors before
they are engaged, and to give the public a single, current reference
for international transfer mechanisms (GDPR Articles 28, 30, 46).

A non-technical summary of the same information appears in
[/privacy](https://goripple.io/privacy) Section 4. This file is the
authoritative version.

---

## Posture

- **No subprocessor is permitted to use Acuity customer data to
  train their AI models.** OpenAI and Anthropic processing is on
  the API tier, which under their respective terms excludes training
  on inbound API content.
- **All subprocessors are bound by a written Data Processing Agreement
  (DPA).** Where the subprocessor publishes a standard DPA we accept
  the published version; where a bespoke DPA exists we have it on
  file under counsel.
- **International transfers** out of the EU/EEA/UK rely on the
  European Commission's Standard Contractual Clauses (SCCs)
  per Implementing Decision (EU) 2021/914, paired with the UK
  International Data Transfer Addendum (IDTA) for transfers
  originating in the UK. **SCCs + UK IDTA are the operative,
  load-bearing transfer basis for every US subprocessor in this
  list** and are present in each subprocessor's DPA. Given the
  pending CJEU appeal against the EU&ndash;US Data Privacy Framework
  (DPF) and ongoing PCLOB instability (position as of June 2026), we
  deliberately do **not** rely on DPF alone. We treat a DPF
  self-certification only as a supplementary basis, and only where we
  have **verified** the importer on `dataprivacyframework.gov/list`.
  As of this revision we cite DPF as supplementary for **Google,
  Meta, and Apple** (verified). **Anthropic is confirmed NOT
  DPF-certified** and relies on SCCs + UK IDTA. The DPF status of
  OpenAI, Stripe, Supabase, Vercel, Resend, Inngest, PostHog, and
  Sentry is pending individual verification; until verified we state
  SCCs + UK IDTA only — itself a sufficient transfer mechanism under
  Art. 46(2)(c) GDPR.
- **Transfer risk assessments.** Where we rely on SCCs/IDTA for US
  transfers we maintain a transfer impact assessment per subprocessor
  and apply supplementary measures (encryption in transit + at rest,
  data minimisation, short audio-retention windows). A copy of the
  relevant SCCs/IDTA is available on request to
  privacy@heelerdigital.com.
- **Notice of change.** We will give existing customers at least
  30 days' written notice of any new or changed subprocessor via this
  page and (for accounts with marketing consent) by email.

---

## Active subprocessors

### 1. OpenAI

| Field | Detail |
|---|---|
| Service | Whisper API (voice-to-text transcription) |
| Personal data processed | Voice audio + the resulting transcript |
| Retention by subprocessor | Audio not retained beyond the transcription request |
| Country of processing | United States |
| DPA | https://openai.com/policies/data-processing-addendum |
| SCCs / IDTA | Included in DPA — operative transfer basis |
| DPF self-certification | Pending verification at dataprivacyframework.gov/list; SCCs + UK IDTA operative until confirmed |

### 2. Anthropic

| Field | Detail |
|---|---|
| Service | Claude API (AI extraction, weekly reports, Life Audits) |
| Personal data processed | Transcript text + prompt context |
| Retention by subprocessor | Per Anthropic Commercial Terms — no training on API inputs |
| Country of processing | United States |
| DPA | https://www.anthropic.com/legal/dpa |
| SCCs / IDTA | Included in DPA — operative transfer basis |
| DPF self-certification | No — confirmed NOT certified; relies on SCCs + UK IDTA |

### 3. Stripe, Inc.

| Field | Detail |
|---|---|
| Service | Subscription billing, payment processing, customer portal |
| Personal data processed | Email, name, billing address, payment method (held by Stripe, not Acuity), subscription identifiers |
| Retention by subprocessor | Per Stripe records-retention policy; typically 7 years for tax + financial law compliance |
| Country of processing | United States (Stripe, Inc.); Ireland (Stripe Payments Europe Ltd) for EU/EEA customers |
| DPA | https://stripe.com/legal/dpa |
| SCCs / IDTA | Included in DPA — operative transfer basis |
| DPF self-certification | Pending verification at dataprivacyframework.gov/list; SCCs + UK IDTA operative until confirmed |

### 4. Supabase

| Field | Detail |
|---|---|
| Service | Managed PostgreSQL database; object storage for voice files (in transit only — files are deleted from storage within minutes of transcription) |
| Personal data processed | All structured personal data Acuity retains (account, transcripts, extracted artifacts) |
| Retention by subprocessor | As long as Acuity holds the data; scheduled backups + Point-in-Time Recovery retained for 7 days on a rolling window (Supabase Pro plan) |
| Country of processing | United States (us-west-2 region) |
| DPA | https://supabase.com/legal/dpa |
| SCCs / IDTA | Included in DPA — operative transfer basis |
| DPF self-certification | No — relies on SCCs + UK IDTA |

### 5. Vercel, Inc.

| Field | Detail |
|---|---|
| Service | Web + API hosting, serverless function execution |
| Personal data processed | Incidental — request metadata (path, status, IP at the infrastructure layer). Function bodies are not logged. |
| Retention by subprocessor | Runtime logs 1 day (Vercel Pro plan; Observability Plus not enabled) |
| Country of processing | United States |
| DPA | https://vercel.com/legal/dpa |
| SCCs / IDTA | Included in DPA — operative transfer basis |
| DPF self-certification | Pending verification at dataprivacyframework.gov/list; SCCs + UK IDTA operative until confirmed |

### 6. Resend (Resend, Inc.)

| Field | Detail |
|---|---|
| Service | Transactional + marketing email delivery |
| Personal data processed | Email address, email body, send + delivery metadata |
| Retention by subprocessor | Per Resend retention defaults; configurable |
| Country of processing | United States |
| DPA | https://resend.com/legal/dpa |
| SCCs / IDTA | Included in DPA — operative transfer basis |
| DPF self-certification | No — relies on SCCs + UK IDTA |

### 7. Inngest, Inc.

| Field | Detail |
|---|---|
| Service | Background job orchestration (notifications cron, achievements sweep, weekly report generation, etc.) |
| Personal data processed | Event payloads keyed on userId; never full transcripts or audio |
| Retention by subprocessor | Event history retained per Inngest plan (~14 days default) |
| Country of processing | United States |
| DPA | https://www.inngest.com/legal/dpa |
| SCCs / IDTA | Included in DPA — operative transfer basis |
| DPF self-certification | No — relies on SCCs + UK IDTA |

### 8. PostHog, Inc. (PostHog Cloud US)

| Field | Detail |
|---|---|
| Service | Product analytics (consent-gated; loaded only after the user grants analytics consent) |
| Personal data processed | Sanitised event payloads. The user identifier is a SHA-256 hash of the email; transcripts, audio, and free-text fields are redacted by a server-side scrubber before any event is sent. |
| Retention by subprocessor | Per the contractual term of our agreement |
| Country of processing | United States (PostHog Cloud US) |
| DPA | https://posthog.com/dpa |
| SCCs / IDTA | Included in DPA — operative transfer basis |
| DPF self-certification | Pending verification at dataprivacyframework.gov/list; SCCs + UK IDTA operative until confirmed |

### 9. Functional Software, Inc. (Sentry)

| Field | Detail |
|---|---|
| Service | Crash + error monitoring |
| Personal data processed | Scrubbed crash + error events. The `beforeSend` hook in the SDK runs a `scrubDeep` redactor that removes any email-, name-, transcript-, audio-, or token-shaped key from the payload before upload. |
| Retention by subprocessor | 30 days (Sentry Developer plan) |
| Country of processing | United States |
| DPA | https://sentry.io/legal/dpa |
| SCCs / IDTA | Included in DPA — operative transfer basis |
| DPF self-certification | Pending verification at dataprivacyframework.gov/list; SCCs + UK IDTA operative until confirmed |

### 10. Google LLC

| Field | Detail |
|---|---|
| Service | (a) Sign in with Google (OAuth identity); (b) Google Analytics 4 (consent-gated); (c) Firebase Cloud Messaging (FCM) — Android push notification delivery |
| Personal data processed | (a) Email, name, profile image URL via OAuth; (b) pseudonymised page-view events; (c) device push token + small reminder payload strings |
| Retention by subprocessor | (a) Per Google account terms; (b) GA4 default retention 14 months; (c) per FCM defaults |
| Country of processing | United States |
| DPA | https://business.safety.google/processorterms |
| SCCs / IDTA | Included in DPA — operative transfer basis |
| DPF self-certification | Yes (verified) — supplements SCCs + UK IDTA |

### 11. Meta Platforms, Inc.

| Field | Detail |
|---|---|
| Service | Meta Pixel (marketing attribution; consent-gated) |
| Personal data processed | Page view metadata, hashed email when present, attribution IDs — only when the visitor grants marketing consent on the cookie banner |
| Retention by subprocessor | Per Meta's data retention policy |
| Country of processing | United States; Ireland (Meta Platforms Ireland Ltd) for EU/EEA traffic |
| DPA | https://www.facebook.com/legal/terms/dataprocessingterms |
| SCCs / IDTA | Included in DPA |
| DPF self-certification | Yes (verified, Meta) — supplements SCCs + UK IDTA |

### 12. Apple Inc.

| Field | Detail |
|---|---|
| Service | (a) Sign in with Apple (OAuth identity); (b) Apple Push Notification service (delivery transport for iOS push notifications) |
| Personal data processed | (a) Apple-provided identifier (often a private-relay email); (b) push token + payload (small reminder body strings) |
| Retention by subprocessor | Per Apple's published terms |
| Country of processing | United States; Ireland (Apple Distribution International Ltd) for EU/EEA |
| DPA | Apple Developer Program License Agreement and Apple's Data and Privacy terms |
| SCCs / IDTA | Included in agreement — operative transfer basis |
| DPF self-certification | Yes (verified, Apple) — supplements SCCs + UK IDTA |

### 13. Expo (650 Industries, Inc.)

| Field | Detail |
|---|---|
| Service | Expo push notification service — relays push tokens and routes notification delivery to APNs (iOS) and FCM (Android) |
| Personal data processed | Device push token + small reminder payload strings (no transcripts or audio) |
| Retention by subprocessor | Transient — tokens + messages held only for delivery routing |
| Country of processing | United States |
| DPA | https://expo.dev/terms (Expo Data Processing Addendum) |
| SCCs / IDTA | Included in DPA — operative transfer basis |
| DPF self-certification | No — relies on SCCs + UK IDTA |

---

## Subprocessors removed in the last 12 months

None.

---

## Subprocessors NOT used

For completeness and to avoid confusion with industry-typical
stacks, the following services are NOT engaged by Acuity:

| Service | Status |
|---|---|
| Mailchimp | Not used. Acuity does not maintain a marketing list outside of Resend. |
| Sendgrid | Not used. |
| Segment / RudderStack / Customer.io | Not used. PostHog is our sole product analytics processor. |
| Hotjar / FullStory | Not used. Contentsquare (analytics-gated) is the only session-recording tool. |
| AWS S3 / CloudFront | Not used directly. (Supabase storage is built on AWS S3 under their own infrastructure agreement; we have no direct AWS contract.) |
| Cloudflare | Not used directly. (Vercel uses Cloudflare for some edge points under their own infrastructure agreement.) |
| Datadog / New Relic | Not used. Sentry covers our crash and error telemetry; Vercel covers function metrics. |
| Auth0 / Clerk / WorkOS | Not used. Sign-in is NextAuth.js with Google + Apple OAuth + email-password. |

---

## Internal review and change log

| Date | Change |
|---|---|
| 2026-06-03 | First publication ahead of Phase 1 international launch (UK / IE / AU / NZ). |
| 2026-06-03 | v1.4 GDPR slice: added Expo + Google FCM (Android push) as subprocessors; corrected Anthropic to NOT DPF-certified; reframed DPF as supplementary-where-verified (Google/Meta/Apple only) with SCCs + UK IDTA as the operative basis for all US transfers; added TIA note. |

For questions, requests, or notices regarding this list, email
privacy@heelerdigital.com.
