# Production readiness audit — 2026-04-21

**Scope:** Full-stack security + privacy + resilience audit for public-user launch. Read-only — no code changed during this pass.

**Status legend:** ✓ secure · ⚠ tech debt · ✗ vulnerability · ? needs verification

---

## Executive summary

Acuity's core posture is **production-viable with known gaps**. Auth, IDOR, webhook signing, rate limiting (when Upstash is provisioned), PII scrubbing in Sentry client+server+mobile, and admin gating are all in good shape. The per-route authorization pattern (`where: { id, userId }`) is consistently applied across ~81 routes — no IDOR vulnerabilities found.

The serious issues are **abuse surfaces and compliance gaps**, not remote-code-exec or data-leak paths: a plus-addressing bypass lets users farm trials, no signed data-processing-agreement with Anthropic/OpenAI means user transcripts reach third parties without a contractual data-minimization guarantee, the GDPR data export is missing 8 user tables, and the RedFlag scanner surfaces signals passively with no real-time alert path. Several unbounded `String` columns (Goal.title, Task.description, transcript) are DB-bloat and DoS vectors.

**Recommended gate for public launch:** resolve the 5 CRITICAL items below + at least the top 5 HIGH. MEDIUMs can ship within 30 days post-launch.

---

## CRITICAL (must fix before public launch)

| # | Finding | Blast radius |
|---|---|---|
| C1 | **Gmail plus-addressing bypasses the trial-reset tombstone.** `trialDaysForEmail()` normalizes to lowercase+trim only; `alice+tag@gmail.com` and `alice@gmail.com` hash to different keys. A user can delete + re-sign-up with `alice+N@gmail.com` to farm unlimited 14-day trials. | unlimited free access |
| C2 | **No Zero Data Retention with Anthropic/OpenAI.** Raw transcripts + audio + embeddings ship to both providers with no ZDR header, no enterprise DPA evidenced in code, no no-training flag. For a mental-health-adjacent product this is both a legal (GDPR Art. 28 sub-processor agreement) and trust risk. | regulatory + user trust |
| C3 | **GDPR data export incomplete.** 8 user-scoped tables not in the zip: `StateOfMeReport`, `UserMemory`, `CalendarConnection`, `HealthSnapshot`, `Account`, `GoalSuggestion`, `UserFeatureOverride`, `UserLifeDimension`. Article 15 "right to access" covers all personal data, not a curated subset. | GDPR enforcement risk |
| C4 | **Unbounded user-input strings.** `Goal.title`, `Goal.description`, `Task.title`, `Task.description`, `Entry.transcript`, admin `ContentPiece.finalBody` have no `z.string().max()` or DB length caps. A malicious client can POST 10MB strings on every mutation → DB bloat, Prisma query memory pressure, and possible OOM on list renders. | DoS + cost |
| C5 | **Sentry edge runtime has no PII scrub.** `sentry.edge.config.ts` lacks the `beforeSend` / `beforeBreadcrumb` hooks the client + server configs use. Middleware exceptions (auth, routing) can surface plaintext email + cookies + authorization headers to the Sentry dashboard. | PII leak to Sentry logs |

---

## HIGH (should fix before public launch — not blocking but close)

| # | Finding |
|---|---|
| H1 | **Inngest background jobs not instrumented with Sentry.** If `process-entry`, `content-factory`, `weekly-digest`, or `scan-red-flags` throws, the error stays in Inngest's own dashboard. Breach signals, silent data-corruption bugs, and cron failures are invisible to Jim's Sentry workflow. |
| H2 | **RedFlag scanner is pull-only.** A CRITICAL flag (bulk trial extensions, payment-failure spike, Inngest job failure) sits dormant until Jim opens the admin Overview tab. No Slack / email / PostHog-alert webhook integration. Scanner itself also doesn't check admin-action velocity (>N extends/hour, mass deletions). |
| H3 | **No IP-based signup rate limit.** `/api/auth/signup` is per-email (5/hour), not per-IP. Combined with plus-addressing (C1), one attacker can farm referrals or brute-force account enumeration from a single IP. |
| H4 | **7 admin content-factory mutations skip AdminAuditLog.** `approve`, `bulk-approve`, `reject`, `edit`, `unpublish`, `mark-distributed`, `generate-now` all mutate without recording to `AdminAuditLog`. The audit trail covers ~53% of admin writes; compliance review expects 100%. |
| H5 | **Zero Zod coverage across ~41 API mutations.** Every POST/PATCH/PUT validates manually with `.catch(() => null)` + inline type guards. Works today but drifts with every new field; caps are inconsistent; missing field detection is by convention. Introduces systemic input-validation debt. |
| H6 | **Server-side PostHog `track()` calls not consent-gated.** `lib/posthog.ts::track()` fires regardless of the user's `User.cookieConsent.analytics` state. Client-side events ARE gated; server-side are not. GDPR e-Privacy concern for EU users. |
| H7 | **`compute-user-insights` swallows Claude failures silently.** Line 152-158: `.catch(err => null)` on Claude → the heuristic fallback at line 177-183 only runs if Claude returned a value. A Claude outage means zero insights that week, not the heuristic fallback. |
| H8 | **Sentry PII patterns miss `audioPath` and `transcription`.** Only `email|transcript|summary|content|entry|rawanalysis|password|token|sessiontoken|authorization|cookie` are redacted. Fields named `audioPath` or `transcription` (less common but real) would serialize plaintext. |
| H9 | **OpenAI + Anthropic SDK calls have no explicit timeout.** Defaults are 10 minutes. A stuck upstream can tie up Vercel function seconds (cost) and Inngest retry budget. Wrap with `AbortController` + 30-60s ceiling. |
| H10 | **Rate limiters fail open when Upstash env is unset.** Intentional for local dev. In production, a botched Upstash provisioning silently removes all rate protection with only a one-time log line. Add a liveness check that fails the deploy if `NODE_ENV=production` and limiters are no-op. |
| H11 | **Stripe webhook leaks signature-error detail to caller.** `stripe/webhook/route.ts:33-36` returns the raw Stripe SDK message. Should be opaque `Invalid signature` (400) — the raw message can aid attackers tuning signature forgeries. |
| H12 | **Referral code uses `Math.random()`.** `lib/referrals.ts:23`. 8 chars from 32-char alphabet = 1.1T space; collision unlikely, but `Math.random()` is predictable across the same V8 session. Swap to `crypto.randomBytes(6)` modulo alphabet. |

---

## MEDIUM (fix within 30 days post-launch)

| # | Finding |
|---|---|
| M1 | **`durationSeconds` in `/api/record` not validated.** `Number(formData.get("durationSeconds"))` accepts negatives, `Infinity`, `NaN`. Enforce 1..3600 bounds. |
| M2 | **Self-referral technically possible via DB tampering.** `lib/referrals.ts::recordReferralConversion` doesn't assert `user.referredById !== userId`. Signup flow prevents this in practice (different User rows), but add defensive check at line 58. |
| M3 | **`cancel_at_period_end` not exposed to client.** When user cancels in Stripe portal, they stay PRO until period end (correct), but `/account` doesn't show a "canceling on MM DD" banner. UX + trust gap, not a security bug. |
| M4 | **Silent `.catch(() => {})` on Entry FAILED update.** `lib/pipeline.ts:430-435` swallows DB errors when marking an entry failed. If this write fails, the user sees a stuck entry forever. Log + Sentry. |
| M5 | **No retry on Supabase Storage upload failure in sync path.** `/api/record` returns 502 on one-shot failure. Add 2-3 exponential-backoff retries before bailing. |
| M6 | **No Prisma pool-exhaustion handling.** Default pool 10, default query timeout 10s. On Vercel Hobby with pgbouncer, this can deadlock under concurrent Inngest steps + API requests. Document pool target + add timeout config. |
| M7 | **No uptime monitor.** Nothing external pings `/` or `/api/health` (nonexistent). If Vercel+Supabase both go down at 3am, Jim finds out from a user email. |
| M8 | **Vercel log retention is ~24h.** No forwarding to external sink (Datadog, Better Stack, S3). Breach forensics beyond a day requires Sentry events + AdminAuditLog + Inngest dashboard, not a unified log trail. |
| M9 | **Mobile JWT has no server-side revocation list.** A compromised mobile session remains valid until 30-day expiry. Accept for v1 (consumer app, low per-transaction value); revisit before iOS App Store privileged-access features. |
| M10 | **Unused `apps/mobile/lib/supabase.ts` uses AsyncStorage.** Not called anywhere, but the file initializes a Supabase client with plaintext `AsyncStorage` session persistence. Delete the file + the `@supabase/supabase-js` mobile dep. |

---

## LOW / accepted

| # | Finding |
|---|---|
| L1 | `.env.local.save` history purge still pending. Supabase password rotated 2026-04-18; residual is hygiene only (public repo, rotated creds). Covered in PROGRESS.md. |
| L2 | No biometric auth (FaceID/TouchID) on mobile. Acceptable for v1 consumer app. |
| L3 | No jailbreak/root detection. Acceptable. |
| L4 | No virus scan on audio uploads. Supabase Storage does basic malware checks; audio → Whisper → transcript flow doesn't execute the file. |
| L5 | Screenshot protection on journal screens not implemented. Optional privacy-enhancement. |
| L6 | No login anomaly detection (impossible-travel, brute-force velocity). Post-launch observability. |

---

## Section-by-section findings

### AUTH + SESSION SECURITY

| Check | Status | File:line | Note |
|---|---|---|---|
| Every /api/* endpoint has auth where required | ✓ | 81 routes surveyed | No unauth-by-accident routes found |
| Public-by-design routes justified | ✓ | /api/auth/*, /api/inngest, /api/stripe/webhook, /api/waitlist, /api/emails/unsubscribe (token-gated), /shared/* (public share IDs) | Each verified |
| IDOR check — every id route joins on userId | ✓ | /api/entries/[id], /api/goals/[id], /api/weekly/[id]/share, /api/state-of-me/[id]/share, /api/admin/users/[id] | No IDOR found |
| Session invalidation on account delete (cookies) | ✓ | /api/user/delete:125-144 | User delete cascades Session rows via FK; adapter-backed so cookies 401 immediately |
| Mobile JWT revocation on delete | ⚠ | M9 | 30-day JWT max-age; no blocklist — accepted for consumer v1 |
| OAuth redirect URI whitelist | ✓ | lib/auth.ts:21-35 | NextAuth-managed; mobile-callback audience-validated against EXPECTED_IOS_AUDIENCES |
| Password reset token: cryptographically random | ✓ | lib/auth-tokens.ts:11-18 | `crypto.randomBytes(32).base64url` |
| Reset token: single-use + 1h expiry | ✓ | /api/auth/reset-password:63-94 | Cleared on use; expiry enforced server-side |
| Auth endpoint rate limits | ✓ | /lib/rate-limit.ts | authByEmail 5/hour, auth 5/15min IP, waitlist 3/hour IP |
| No IP-based signup rate limit | ⚠ | H3 | Per-email only; combined with C1 enables farming |
| Referral code uses Math.random | ⚠ | H12 · lib/referrals.ts:23 | Swap to crypto.randomBytes |
| Email unsubscribe tokens HMAC-SHA256 + timing-safe | ✓ | lib/email-tokens.ts:41-80 | — |
| Admin guard: session + DB isAdmin lookup | ✓ | lib/admin-guard.ts:20-47 | Not trusting JWT claims |

### DATA ACCESS SECURITY

| Check | Status | File:line | Note |
|---|---|---|---|
| Audio: signed URL behind auth + short TTL | ✓ | /api/entries/[id]/audio/route.ts:64,94 | 5-min signed URL; ownership check + private bucket |
| Audio caching headers prevent intermediary cache | ✓ | /api/entries/[id]/audio/route.ts:113-115 | `Cache-Control: private, no-store, max-age=0` |
| Entry listing ownership | ✓ | /api/entries/route.ts:12-29 | `where: { userId }` |
| Entry fetch by id ownership | ✓ | /api/entries/[id]/route.ts:25-40 | `entry.userId === userId` → 404 on mismatch |
| Public share IDs crypto-random (128 bits) | ✓ | /api/weekly/[id]/share/route.ts:30, /api/state-of-me/[id]/share/route.ts:20-22 | `randomBytes(16).base64url` |
| Share expiry enforced server-side | ✓ | /shared/weekly/[id]/page.tsx:59-64 | ExpiredState (not 404) |
| noindex + X-Robots-Tag on share pages | ✓ | /shared/weekly/[id]/page.tsx:27-29 | Both present |
| Share URL tampering (swap ID) | ✓ | /shared/state-of-me/[id]/page.tsx:24-28 | Query by publicShareId only, 404 if not found |
| Data export: rate-limited 1/7d | ✓ | /api/user/export:57-76 | Server-side DataExport row check |
| Data export signed URL TTL | ✓ | /inngest/functions/generate-data-export.ts:32 | 24h |
| Data export coverage incomplete | ✗ | C3 | 8 user tables missing |
| Supabase buckets private | ✓ | voice-entries + user-exports | Signed URLs only; no public CDN path found |
| Claude/OpenAI: no userId/email in prompts | ✓ | lib/pipeline.ts:159-169, lib/embeddings.ts:50-54 | Transcript/summary only |
| Anthropic/OpenAI Zero Data Retention | ✗ | C2 | No ZDR header / DPA evidence |

### INPUT VALIDATION

| Check | Status | File:line | Note |
|---|---|---|---|
| Zod `.safeParse()` coverage on mutations | ⚠ | H5 | 0 of ~41 endpoints use Zod; manual catch + type guards instead |
| Goal/Task title+description max length | ✗ | C4 | Unbounded |
| Transcript max length | ⚠ | C4 | Whisper caps audio (25MB), transcript itself uncapped |
| UserDemographics validation | ✓ | /api/onboarding/update | Enum + length caps |
| Onboarding referralSource capped | ✓ | /api/onboarding/update | `.slice(0, 120)` |
| Admin content-factory `finalBody` capped | ⚠ | /api/admin/content-factory/edit | Unbounded |
| Audio size limit | ✓ | /api/record:89 | 25MB |
| Audio MIME validation | ✓ | /api/record:104 | normalizeAudioMimeType() |
| Audio filename sanitization | ✓ | Generated `${userId}/${entryId}.${ext}` | No user input in path |
| `durationSeconds` bounds check | ⚠ | M1 · /api/record:112 | `Number()` with no bounds |
| $queryRaw / $queryRawUnsafe audit | ✓ | 4 files, all template-tagged safely | — |
| dangerouslySetInnerHTML audit | ✓ | Only JSON-LD + DOMPurify-sanitized content factory previews | XSS-safe |
| Email template HTML escaping | ✓ | escapeHtml on firstName/theme/observations | — |
| Date param parsing validation | ⚠ | /api/admin/metrics:27-30 | `new Date(str)` accepts "invalid" → Invalid Date; add isNaN check |

### PAYMENT + SUBSCRIPTION INTEGRITY

| Check | Status | File:line | Note |
|---|---|---|---|
| /api/record PRO gate | ✓ | /api/record:67 | canRecord |
| /api/weekly PRO gate | ✓ | /api/weekly:58 | canGenerateNewWeeklyReport |
| /api/lifemap/refresh PRO gate | ✓ | /api/lifemap/refresh:38 | canRefreshLifeMap |
| /api/life-audit PRO gate | ✓ | /api/life-audit:76 | canGenerateNewLifeAudit |
| /api/state-of-me: entitlement gate vs feature flag only | ⚠ | /api/state-of-me:51 | Uses `gateFeatureFlag` only — relies on flag's `requiredTier: PRO` seed. Confirm in prod; if flag tier is dropped, TRIAL users gain access. Add belt-and-braces `requireEntitlement()`. |
| Stripe webhook signature verification | ✓ | /api/stripe/webhook:27 | `constructEvent` with STRIPE_WEBHOOK_SECRET |
| Stripe webhook idempotency | ✓ | /api/stripe/webhook:48-56 | StripeEvent unique-id insert; P2002 returns 200+duplicate |
| Trial exploit: delete-and-recreate normalized | ✗ | C1 · lib/bootstrap-user.ts:140 | Plus-addressing bypasses DeletedUser tombstone |
| Self-referral check in recordReferralConversion | ⚠ | M2 · lib/referrals.ts:52-100 | Defensive check missing — signup path prevents it incidentally |
| Per-IP / per-domain referral cap | ⚠ | H3 | None |
| REFERRAL_ANNUAL_CAP enforced | ✓ | lib/referrals.ts:32 | 12/yr |
| customer.subscription.updated handled | ✓ | /api/stripe/webhook:170-206 | Maps to PRO/PAST_DUE/FREE |
| cancel_at_period_end surfaced to UI | ⚠ | M3 | Backend correct; UI lacks banner |
| customer.subscription.deleted handled | ✓ | /api/stripe/webhook:208-219 | Clears subscriptionStatus + Stripe refs |
| PATCH /api/user can set subscriptionStatus | ✓ | No such endpoint exists | Webhook-only mutation |
| PATCH /api/user can set trialEndsAt | ✓ | Only via admin `/extend-trial` | — |
| Stripe price from env | ✓ | /api/stripe/checkout:33 | `STRIPE_PRO_PRICE_ID` |

### SECRETS + CREDENTIALS

| Check | Status | File:line | Note |
|---|---|---|---|
| Hardcoded API-key scan | ✓ | No matches outside .env.local.save history | — |
| `.env.local.save` tracked | ⚠ | L1 · rotated 2026-04-18 | Residual: needs `git filter-repo` |
| .gitignore `.env*` with `!.env.example` | ✓ | .gitignore:13-15 | Plus manual block at L58 |
| Should also exclude `.env*.save` / `.env*.bak` | ⚠ | Minor | Add to .gitignore |
| Server-only secrets never in "use client" | ✓ | Grepped each: ANTHROPIC, OPENAI, STRIPE_SECRET, SUPABASE_SERVICE_ROLE, RESEND, NEXTAUTH_SECRET, INNGEST_SIGNING | No leaks |
| NEXT_PUBLIC_SUPABASE_ANON_KEY safety | ⚠ | Only safe with RLS | 7/12 tables missing RLS per docs/RLS_STATUS.md — Jim has SQL pending |
| Generic error-message leakage | ⚠ | H11 · /api/stripe/webhook:33-36 | Raw Stripe SDK error returned |
| `toClientError()` used everywhere | ⚠ | Only 1 of 81 routes | Other routes use safe hardcoded strings — inconsistent but not leaky |

### RESILIENCE + ERROR HANDLING

| Check | Status | File:line | Note |
|---|---|---|---|
| OpenAI SDK explicit timeout | ⚠ | H9 · lib/pipeline.ts:81, embeddings.ts:51 | 10-min SDK default |
| Anthropic SDK explicit timeout | ⚠ | H9 | Same |
| Stripe SDK timeout | ⚠ | lib/stripe.ts:3 | Default |
| Resend send timeout | ⚠ | lib/resend.ts | All calls try/caught; email loss acceptable |
| Audio upload failure mode — entry persists | ✓ | /api/record:122-152, lib/pipeline.ts:268-275 | Entry row created first, upload failure ≠ data loss |
| Supabase upload retry | ⚠ | M5 | None; 502 on one-shot fail |
| Whisper 500 → user can retry | ✓ | process-entry.ts:56-70 | Entry → FAILED or PARTIAL; audio retained |
| processEntry retries | ✓ | process-entry.ts:22-32 | retries: 2 user-interactive |
| generateWeeklyReport retries | ✓ | generate-weekly-report.ts | retries: 3 background |
| generateLifeAudit onFailure: degraded fallback | ✓ | generate-life-audit.ts:36-116 | Best-in-class; model for other crits |
| computeUserInsights: heuristic fallback on Claude fail | ✗ | H7 · compute-user-insights.ts:152-158 | `.catch(err => null)` skips both Claude + heuristic |
| weekly/monthly digest: retry on email fail | ⚠ | Best-effort | Silent drop for the cycle |
| refreshLifeMap retries | ✓ | refresh-lifemap.ts | retries: 2 |
| Prisma pool size explicit | ⚠ | M6 · lib/prisma.ts | Default 10 |
| Silent `.catch(() => {})` | ⚠ | M4 · lib/pipeline.ts:430-435 | Entry FAILED update can fail silently |
| Inngest not Sentry-instrumented | ✗ | H1 | — |

### PRIVACY + COMPLIANCE

| Check | Status | File:line | Note |
|---|---|---|---|
| Sentry client PII scrub | ✓ | sentry.client.config.ts:25-36 | 12 patterns, depth=6 |
| Sentry server PII scrub | ✓ | sentry.server.config.ts:11-24 | Includes authorization+cookie headers |
| Sentry edge PII scrub | ✗ | C5 | Missing beforeSend |
| Sentry mobile PII scrub | ✓ | mobile/lib/sentry.ts:22-33 | Mirrors server |
| `audioPath` + `transcription` redacted | ⚠ | H8 | Not in pattern list |
| safeLog sanitizer coverage | ✓ | lib/safe-log.ts:27-34 | Recursive; email → sha256 prefix |
| Anthropic ZDR | ✗ | C2 | No header / DPA evidence |
| OpenAI ZDR (Whisper + embeddings) | ✗ | C2 | Same |
| PostHog client: consent-gated | ✓ | components/posthog-provider.tsx:31-73 | Listens to `acuity:consent-changed` |
| PostHog server: consent-gated | ✗ | H6 · lib/posthog.ts | No consent check on track() |
| Meta Pixel / GA consent-gated | ✓ | components/consent-gated-trackers.tsx | Both require consent |
| Data export coverage | ✗ | C3 | 8 tables missing |
| Account delete: User cascade | ✓ | schema.prisma | 23 onDelete:Cascade verified |
| Account delete: VerificationToken | ✓ | /api/user/delete:140-142 | Manual deleteMany by email |
| Account delete: Stripe customer | ✓ | /api/user/delete:102-110 | Best-effort |
| Account delete: Supabase Storage | ✓ | /api/user/delete:157-198 | Pagination loop |
| Account delete: DeletedUser tombstone | ✓ | /api/user/delete:127-139 | Pre-cascade upsert |
| Self-service export from /account | ✓ | DataExportSection | GET + POST flow |

### ADMIN SECURITY

| Check | Status | Note |
|---|---|---|
| All /admin/* under isAdmin layout | ✓ | admin/layout.tsx:1-28 |
| All 22 /api/admin/* routes gated | ✓ | 9 via requireAdmin(), 13 inline (equivalent) |
| Admin audit log: flag toggles | ✓ | All 3 properties (enabled/rollout/tier) |
| Admin audit log: override upsert + delete | ✓ | — |
| Admin audit log: user mgmt (delete/extend/reset) | ✓ | — |
| Admin audit log: content-factory mutations | ✗ | H4 · 7 routes skip logging |
| Non-admin privilege escalation surface | ✓ | No in-app path to flip isAdmin; DB UPDATE only |
| Session tamper resistance | ✓ | requireAdmin re-queries DB on every call, doesn't trust JWT claims |

### MOBILE

| Check | Status | Note |
|---|---|---|
| Token storage: SecureStore (Keychain-backed) | ✓ | lib/auth.ts:42-52 |
| Unused Supabase/AsyncStorage file | ⚠ | M10 |
| Deep link: OAuth PKCE with audience validation | ✓ | mobile-callback:178-205 |
| Magic link single-use (no CSRF state) | ✓ | Token single-use on server makes state parameter unnecessary |
| HTTPS-only (no cleartext traffic) | ✓ | ATS enforced; EAS prod uses EXPO_PUBLIC_API_URL |
| EAS production sets EXPO_PUBLIC_API_URL | ? | Verify before App Store submit — hardcoded `http://localhost:3000` fallback exists |
| Biometric auth | ⚠ | L2 |
| Jailbreak detection | ⚠ | L3 |
| Mobile Sentry PII scrub | ✓ | Aggressive, depth=6 |
| No hardcoded secrets in bundle | ✓ | Only EXPO_PUBLIC_ prefix values |

### OBSERVABILITY

| Check | Status | Note |
|---|---|---|
| Sentry wraps Next.js API routes | ✓ | next.config.js:120-130 |
| Inngest functions instrumented | ✗ | H1 |
| Global error boundary → Sentry | ✓ | global-error.tsx:18-20 |
| Admin smoke-test endpoint | ✓ | /api/test-sentry-error |
| RedFlag scanner runs | ✓ | scan-red-flags.ts every 6h |
| RedFlag real-time alerts (Slack/email) | ✗ | H2 |
| Admin action velocity detector | ✗ | H2 (missing check in scan-red-flags) |
| Structured logging via safeLog | ✓ | lib/safe-log.ts |
| Vercel log retention beyond 24h | ⚠ | M8 |
| Uptime monitor | ⚠ | M7 |
| Login anomaly detection | ⚠ | L6 |

---

## Already production-grade (brief confirmation)

- **Authentication + session layer.** NextAuth + Prisma adapter + mobile JWT hybrid is coherent. Password reset flow is textbook (crypto-random, single-use, 1h TTL, always-200 on forgot-password). Admin guard re-queries isAdmin on every call.
- **IDOR posture.** The `where: { id, userId }` pattern is applied with discipline across ~81 routes. No stray `findUnique({ where: { id } })` without ownership join.
- **Webhook idempotency.** StripeEvent unique-constraint pattern on event.id is the right shape; handlers are idempotent by construction.
- **Audio privacy.** Private bucket + server-side signing + 5-min TTL + `Cache-Control: private, no-store`. No direct CDN paths leaked.
- **Public share links.** 128-bit `randomBytes(16).base64url` IDs; server-enforced expiry with distinct ExpiredState (not 404); robots noindex both as meta + `X-Robots-Tag`.
- **SQL injection surface.** All 4 `$queryRaw` call sites use template-tagged parameterization. Grep confirms no `$queryRawUnsafe` string concat.
- **XSS surface.** `dangerouslySetInnerHTML` limited to JSON-LD (code-controlled) and DOMPurify-sanitized content-factory previews. Email templates HTML-escape interpolated user fields.
- **PII scrubbing in Sentry (client + server + mobile).** 12+ patterns, depth=6 recursion. Edge is the lone gap (C5).
- **Account deletion end-to-end.** User cascade + VerificationToken cleanup + Stripe customer cancel + Supabase Storage prefix purge + DeletedUser tombstone, in a transaction for the DB piece.
- **Cookie consent gating (client).** GA, Meta Pixel, Hotjar, PostHog all correctly held behind `acuity:consent-changed` event listeners.
- **RedFlag scanner exists and emits structured signals.** Coverage + alert path need work (H2) but the primitive is live.
- **Admin audit trail for high-impact actions.** 8 high-impact writes logged with canonical slugs from `ADMIN_ACTIONS`; content-factory tail (H4) is a gap not a void.
