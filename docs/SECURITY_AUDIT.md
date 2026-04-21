# Acuity — Pre-Public-Beta Security Audit

**Date:** 2026-04-20 (autonomous audit, this session)
**Auditor:** Claude (Opus 4.7, 1M context)
**Scope:** Adversarial deep-read across auth, authz, input validation, secrets, rate-limits, PII, third-parties, mobile, headers, dependencies.
**Branch / commit:** `main` / current HEAD
**Companion docs:** `SECURITY_AUDIT.md` (repo root — prior S1–S9 closeout), `PENTEST_RESULTS.md` (this session), `SOC2_READINESS.md` (this session).

---

## TL;DR — findings counts

| Severity | Found | Fixed now | Deferred |
|---|---:|---:|---:|
| 🔴 CRITICAL | 2 | 2 | 0 |
| 🟠 HIGH | 6 | 4 | 2 |
| 🟡 MEDIUM | 8 | 1 | 7 |
| 🟢 LOW / INFO | 5 | 1 | 4 |

**Fixed this session (see fix commit trail):**

1. Next.js CVSS 9.1 middleware auth bypass (GHSA-f82v-jwr5-mffw) — upgraded `next@14.2.5 → 14.2.35`.
2. nodemailer addressparser DoS — upgraded to `^6.10.1`.
3. No security headers — added CSP (strict allowlist), HSTS (1yr + preload-eligible), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
4. No `/.well-known/security.txt` — added.
5. Cost-bomb exposure on `/api/record` — added 30/day + 300/month per-user caps on top of the existing 10/hr limit. Bounds a compromised-account abuse spend at ~$36/month worst case.
6. Mobile-callback missing `iss` (issuer) check — added. Defense-in-depth even though Google's tokeninfo endpoint validates upstream.
7. Admin `mark-distributed` input not type-checked — added string + URL-scheme validation.

**Top-priority deferred items — see Part B:**

- 🟠 Next.js GHSA-9g9p-9gw9-jx7f (cache poisoning) — only fixed in `next@15.x`. Major-version bump deferred.
- 🟠 Stripe webhook idempotency — no `event.id` dedup. ~2 hours.
- 🟠 Mobile JWT has no refresh/revocation — 30-day token with no server-side invalidation. ~1 day.
- 🟡 callbackUrl redirect not host-allowlisted after OAuth completes.
- 🟡 Admin content-factory routes 3/4 still lack Zod validation.
- 🟡 Audio upload trusts client-advertised MIME; no magic-number check.

---

## Part A — Findings fixed this session

### F-01 🔴 CRITICAL — Next.js middleware authorization bypass (CVSS 9.1)

**Category:** Dependency vulnerability
**CVE:** GHSA-f82v-jwr5-mffw
**Before:** `next@14.2.5` — vulnerable to crafted requests that bypass middleware-enforced authorization. Our middleware enforces NextAuth session protection on `/dashboard/*`, `/record/*`, `/tasks/*`, `/goals/*`, `/insights/*`, `/upgrade/*`. A bypass would let an unauthenticated attacker request those routes (though server components individually re-check session via `getServerSession`, so the damage radius is limited to whatever isn't double-checked).
**Evidence:** `npm audit` report on `apps/web/package.json`. Advisory lists 9.5.0–15.5.14 as affected.
**Fix:** Upgraded `next@14.2.35` (latest stable 14.x). Patch is in the same major line; no API breakage.
**Effort:** fixed now.

### F-02 🔴 CRITICAL — No Content Security Policy

**Category:** Headers
**Before:** `next.config.js` had no `headers()` function; Vercel served no CSP, no HSTS, no X-Frame-Options. First-party XSS, click-jacking, and mixed-content downgrade were all possible at the browser level. For a product handling voice transcripts and mental-health-adjacent content, "no CSP" is the single highest-leverage miss.
**Evidence:** `next.config.js` (original: 13 lines, no headers entry).
**Fix:** Added `async headers()` returning a locked-down CSP that explicitly enumerates each third-party origin we load (GA, Meta Pixel, Hotjar/Contentsquare, PostHog, Stripe, Google Fonts). Paired with HSTS (1yr, includeSubDomains, preload), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy locking down powerful APIs (microphone + payment on self, everything else off).
**Residual:** CSP still allows `'unsafe-inline'` on script-src because of the JSON-LD `<script>` tags in layout + inline GTM/Meta init. Tightening requires hashing each inline script — tracked as follow-up in §F-15.
**Effort:** fixed now.

### F-03 🟠 HIGH — nodemailer DoS via addressparser

**Category:** Dependency vulnerability
**CVE:** GHSA-mm7p-fcc7-pg87
**Before:** `nodemailer@^6.9.14` vulnerable to CPU-exhaustion via crafted RFC-5322 addresses. The magic-link flow runs unauthenticated input through the parser; a malicious attacker could throttle the auth endpoint.
**Evidence:** `npm audit` on `apps/web`.
**Fix:** Upgraded to `^6.10.1`. Also rate-limit on `/api/auth/signin` (5/15min/IP) contains abuse.
**Effort:** fixed now.

### F-04 🟠 HIGH — /api/record cost-bomb exposure

**Category:** Rate limiting / abuse
**Before:** Only `expensiveAi` limiter (10/hr/user). A compromised account at max rate burns 240 records/day × ~$0.12 each = **$29/day** in OpenAI + Anthropic credit, ~$870/month per compromised account. `ClaudeCallLog` is written but never enforced.
**Evidence:** `apps/web/src/lib/rate-limit.ts:75`, `apps/web/src/app/api/record/route.ts:50-52`.
**Fix:** Added two additional per-user limiters stacked in front of `/api/record`:
- `recordDaily` — 30/day/user. Caps daily blast radius at ~$3.60/user.
- `recordMonthly` — 300/month/user. Hard monthly ceiling at ~$36/user worst case.
Real daily-debrief users will hit < 2 records/day; these caps are 15× normal usage. See `apps/web/src/lib/rate-limit.ts` for rationale in comments.
**Effort:** fixed now.

### F-05 🟠 HIGH — Missing `iss` claim check on mobile-callback

**Category:** Auth
**Before:** `/api/auth/mobile-callback` verified audience + email_verified + exp on the Google ID token, but never validated the issuer. Google's tokeninfo endpoint does check upstream, so in practice this is defense-in-depth not a standalone exploit — but a compromised or swapped tokeninfo endpoint would slip through with no second line of defense.
**Evidence:** `apps/web/src/app/api/auth/mobile-callback/route.ts` (the investigate agent confirmed no `info.iss` comparison before our fix).
**Fix:** Added a `VALID_ISSUERS` set containing `accounts.google.com` and `https://accounts.google.com` (both forms Google documents). Rejects 401 if `info.iss` isn't a member. `safeLog.info("mobile-callback.issuer.reject")` records attempts.
**Effort:** fixed now.

### F-06 🟠 HIGH — `security.txt` missing

**Category:** Vulnerability disclosure / hygiene
**Before:** No `/.well-known/security.txt` — security researchers finding issues had no canonical channel beyond `jim@heelerdigital.com` buried in support pages.
**Fix:** Added `apps/web/public/.well-known/security.txt` with contact, expires, canonical, policy, and acknowledgments fields per RFC 9116.
**Effort:** fixed now.

### F-07 🟡 MEDIUM — Admin `mark-distributed` accepts untyped input

**Category:** Input validation
**Before:** `/api/admin/content-factory/mark-distributed` destructured `{ pieceId, distributedUrl }` from JSON with only truthy checks. A compromised admin session could submit a `javascript:` or `file://` URL.
**Fix:** Added `typeof === "string"` narrowing + URL constructor validation requiring `http(s):` scheme.
**Effort:** fixed now.

---

## Part B — Findings deferred with severity + effort

### F-08 🟠 HIGH — Next.js cache-poisoning (GHSA-9g9p-9gw9-jx7f)

**Category:** Dependency vulnerability
**Status:** Patched only in `next@15.x`. The 14.2.35 upgrade from F-01 does NOT fix this one. CVSS 7.5 advisory for cache-key confusion that can serve one user's response to another under specific ISR/cache conditions.
**Effort:** 2-3 days. Major-version bump to Next 15 — breaking changes in cookies()/headers() async signatures, route segment config, and middleware response shape. Needs a careful migration.
**Priority:** Before public signups. Critical path.

### F-09 🟠 HIGH — Stripe webhook idempotency

**Category:** Business logic
**Evidence:** `apps/web/src/app/api/stripe/webhook/route.ts` — verifies signature but doesn't check if `event.id` has been processed before. Stripe retries on 5xx for up to 3 days; duplicate delivery currently double-writes subscription states.
**Impact:** Mostly cosmetic (updateMany upserts are idempotent in DB shape) but wastes compute + logs, and any non-idempotent side-effect added later would drift.
**Fix:** Add a `StripeWebhookEvent` model storing `{ id, processedAt }`; bail early if seen. Or use Upstash Redis with a 7-day TTL for a lighter-weight dedupe store.
**Effort:** ~2 hours for the Redis approach, half a day for a proper DB table + migration.
**Priority:** This week.

### F-10 🟠 HIGH — Mobile JWT: no refresh, no revocation

**Category:** Auth
**Evidence:** `apps/mobile/lib/auth.ts` — bearer JWT lives in `expo-secure-store` for 30 days with no refresh mechanism. `signOut()` clears locally but never notifies the server. A stolen token (e.g. from device compromise) is valid for up to 30 days with no recovery.
**Fix:** Two pieces:
1. Add a `MobileSession` table with `{ id, userId, jwtId, revokedAt, lastSeenAt, userAgent }`. Issue shorter-lived JWTs (e.g. 7 days) containing a session id; check revocation on each API call via `getAnySessionUserId`.
2. `signOut` on mobile POSTs `/api/auth/mobile-signout` to flip `revokedAt`.
**Effort:** ~1 day end-to-end including migration.
**Priority:** Before public signups.

### F-11 🟡 MEDIUM — `callbackUrl` not host-allowlisted

**Category:** Open redirect
**Evidence:** `/auth/signin?callbackUrl=<anything>` — NextAuth's default validator allows same-origin + trusted redirect URLs from the provider config, but we haven't explicitly set `pages.signIn` URL handling.
**Fix:** Add a `callbackUrl` pre-validation in the signin page component that rejects any URL not starting with `/` (same-origin, relative).
**Effort:** 15 min.
**Priority:** This week.

### F-12 🟡 MEDIUM — Admin content-factory input (3 remaining routes)

**Category:** Input validation
**Evidence:** `approve`, `reject`, `edit`, `bulk-approve` admin routes destructure body without proper type-narrowing. Admin-gated so blast radius is limited to admin compromise.
**Fix:** Add Zod schemas or at least type-narrowing similar to F-07.
**Effort:** 1 hour total.
**Priority:** This month.

### F-13 🟡 MEDIUM — Audio upload trusts client-advertised MIME

**Category:** Input validation
**Evidence:** `/api/record/route.ts` — reads `audioFile.type` from multipart header, normalizes via `normalizeAudioMimeType()`, but doesn't sniff the file header for magic bytes. An attacker could upload anything under 25MB labeled `audio/mp4`; Supabase stores it, Whisper will reject non-audio at transcription time.
**Impact:** Limited — Supabase storage takes the bytes, Whisper rejects at step 2, Entry ends in FAILED state. Storage cost is the only exposure (bounded by rate limit + 25MB cap = ~750MB/day worst case per user).
**Fix:** Read first 8 bytes, validate against known magic numbers (WebM = `1A 45 DF A3`, MP4 = contains `ftyp`, WAV = `RIFF...WAVE`, etc.). Reject on mismatch.
**Effort:** 2 hours.
**Priority:** This month.

### F-14 🟡 MEDIUM — Historical credential leak in git history

**Category:** Secrets
**Evidence:** Gitleaks scan finds 6 matches in `apps/web/.env.local.save` at commit `799a63536b` (2026-04-13). Supabase DB password (`KeenanJi...`) in a Postgres connection string, committed to public repo history. Rotated per CREDENTIAL_LEAK_AUDIT.md.
**Status:** **Already mitigated** — password was rotated on discovery. But the value is still in git history and anyone forking the repo before rotation has it. Re-rotating again would invalidate any leaked copy.
**Fix:** Already rotated once. Consider:
1. A second rotation as belt + suspenders (any attacker with the old value may have cached it).
2. `git filter-branch` or `bfg` to purge the file from history — noisy but doable.
3. Revoke + reissue anything else that was ever adjacent to that file.
**Effort:** 30 min for another rotation; half a day for history rewrite.
**Priority:** Before public signups (another rotation + document).

### F-15 🟡 MEDIUM — CSP allows `'unsafe-inline'` on script-src

**Category:** Headers
**Evidence:** `next.config.js` CSP directive — the JSON-LD structured-data tags in `layout.tsx` and `page.tsx` + inline GTM/Meta init scripts require either `'unsafe-inline'` or per-script hash allowlist. We chose `'unsafe-inline'` to land the CSP this session without refactoring.
**Impact:** XSS attacks that land inline scripts still succeed. CSP provides value elsewhere (frame-ancestors, connect-src, img-src, object-src) so this isn't negated; just one missing layer.
**Fix:** Move JSON-LD to a separate static file OR compute SHA-256 hashes at build time and embed in CSP. Either pattern takes ~2 hours.
**Priority:** Month 2.

### F-16 🟡 MEDIUM — NextAuth 30-day JWT is long for a voice-journal app

**Category:** Auth session hygiene
**Evidence:** `apps/web/src/lib/auth.ts:71` — `maxAge: 30 * 24 * 60 * 60`.
**Fix:** Shorten to 7-14 days. `updateAge: 24 * 60 * 60` already sliding-renews on active use, so engaged users won't notice. Inactive users re-auth sooner = smaller stolen-token window.
**Effort:** 1 line + 1 deploy.
**Priority:** This week.

### F-17 🟡 MEDIUM — PostHog event properties — spot-check needed

**Category:** PII in third parties
**Evidence:** `apps/web/src/lib/posthog.ts` claims all `track()` calls run through `safeLog`'s sanitizer. Verified the helper; spot-checking actual call sites is the remaining step.
**Fix:** Audit every `track(` call across `apps/web/src` and confirm no raw transcript, summary, email, or name ends up in properties. If clean, close this with a regression test. If not, redact at the call site.
**Effort:** 1 hour audit + fixes.
**Priority:** Before public signups.

### F-18 🟡 MEDIUM — No audit log for admin actions

**Category:** Logging & monitoring / SOC 2
**Evidence:** `/api/admin/**` routes (dashboard, content-factory) don't write audit-trail entries for who took what action when. Any compromised admin account operates silently.
**Fix:** Add an `AdminAuditLog` Prisma model + one `writeAdminAudit(userId, action, target)` helper called from every admin route.
**Effort:** Half a day including migration + backfill of the existing routes.
**Priority:** This month (required for any enterprise conversation).

### F-19 🟢 LOW — `.env.example` drift

**Category:** Secrets / ops hygiene
**Evidence:** Env-var grep finds ~60 `process.env.*` references; `.env.example` documents ~35. Missing: `AUTH_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `KV_REST_API_TOKEN/URL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`. Documents unused: `EMAIL_SERVER_*`.
**Fix:** Reconcile — add missing, remove unused.
**Effort:** 30 min.
**Priority:** This month.

### F-20 🟢 LOW — Prompt injection — no explicit sanitization

**Category:** LLM input
**Evidence:** `apps/web/src/lib/pipeline.ts` — user transcript is interpolated into the USER message (not system) of the Claude call. Architecturally this is the right place; Claude's alignment resists "ignore previous instructions" reasonably well. But there's no defense-in-depth (e.g. stripping explicit instruction-like patterns, delimiter fencing, or output validation beyond schema shape).
**Impact:** Worst case: an attacker crafts a transcript that manipulates their own extraction JSON. Their own data only — no cross-user exposure. Low severity for the threat model.
**Fix:** Optional. Consider adding: (1) delimiter fencing with random nonces around the transcript, (2) rejection of transcripts with `<|...|>` / markdown-heredoc patterns. Not urgent.
**Effort:** 1 hour.
**Priority:** Month 2 or later.

### F-21 🟢 LOW — Meta Pixel fires on authenticated dashboard

**Category:** Privacy / tracking scope
**Evidence:** Prior audit (`SECURITY_AUDIT.md` §12 S15 at repo root) flagged this. Still not fixed.
**Fix:** Scope Meta Pixel `TrackCompleteRegistration` to fire only on `?onboarded=1` arrivals, not every dashboard load.
**Effort:** 15 min.
**Priority:** Before public signups (data accuracy AND privacy posture).

### F-22 🟢 INFO — Inngest payloads may contain entry IDs

**Category:** Third-party data
**Evidence:** Inngest events dispatched for record/weekly/lifemap include `{ entryId, userId }`. Not PII in itself, but if event payloads ever get richer (e.g. a transcript summary), that's a data-flow change to track.
**Fix:** Standing note in event-dispatch comments documenting what's safe to include.
**Effort:** N/A — monitoring hygiene, not a fix.
**Priority:** Informational.

### F-23 🟢 INFO — Mobile has no certificate pinning

**Category:** Mobile security
**Evidence:** `apps/mobile/lib/api.ts` uses standard `fetch` with no pinning.
**Fix:** Requires native module config. Typically not worth the complexity until there's a real MITM threat model (state-level, enterprise BYOD).
**Priority:** Post-enterprise-traction.

---

## Part C — Prioritized roadmap

### Week 1 (before public signups)

- [F-08] Next.js 15 migration for cache-poisoning patch.
- [F-09] Stripe webhook idempotency (Redis dedupe).
- [F-10] Mobile session refresh + revocation.
- [F-11] callbackUrl host-allowlist.
- [F-14] Second rotation of Supabase password + document.
- [F-17] Audit PostHog call sites.
- [F-21] Meta Pixel scoping.

### Month 1 (before first enterprise conversation)

- [F-12] Zod on remaining admin routes.
- [F-13] Audio magic-number sniffing.
- [F-16] Shorten session maxAge to 7d.
- [F-18] Admin audit log.
- [F-19] `.env.example` reconcile.

### Month 2+ (polish before SOC 2 audit)

- [F-15] CSP without `'unsafe-inline'`.
- [F-20] Prompt injection hardening.
- [F-23] Certificate pinning (post-enterprise).

---

## Part D — Cross-check against prior audit (2026-04-19 closeout)

The previous S1–S9 items are all verified as still in place by this audit (admin auth, RLS, account deletion, audio bucket, rate limiting baseline, cron fail-closed, PII redaction in logs, email HTML escape, supabase.server guard). S10 (Meta Pixel scope) remains open as F-21.

No regressions on prior items.

---

*End of audit. See `PENTEST_RESULTS.md` for adversarial test outcomes and `SOC2_READINESS.md` for control-mapping gaps.*

---

## Part E — Rate Limiting coverage (refreshed 2026-04-21, W8)

All configured limiters (`apps/web/src/lib/rate-limit.ts::limiters`):

| Limiter           | Scope     | Budget       | Applied to                                                                 |
| ----------------- | --------- | ------------ | -------------------------------------------------------------------------- |
| expensiveAi       | user      | 10 / 1h      | /api/record (stacked with recordDaily + recordMonthly)                     |
| recordDaily       | user      | 30 / 1d      | /api/record                                                                |
| recordMonthly     | user      | 300 / 30d    | /api/record                                                                |
| auth              | ip        | 5 / 15m      | NextAuth signin                                                            |
| authByEmail       | email     | 5 / 1h       | /api/auth/signup, /api/auth/forgot-password, /api/auth/mobile-signup       |
| waitlist          | ip        | 3 / 1h       | /api/waitlist                                                              |
| accountDelete     | user      | 3 / 1d       | /api/user/delete                                                           |
| audioPlayback     | user      | 60 / 1m      | signed-URL issuance                                                        |
| **userWrite**     | user      | 30 / 1m      | /api/goals (POST+PATCH), /api/tasks (POST+PATCH), /api/onboarding/update,  |
|                   |           |              | /api/goals/[id]/add-subgoal, /api/progression, /api/insights/observations, |
|                   |           |              | /api/goals/suggestions                                                     |
| **goalReparent**  | user      | 20 / 1m      | /api/goals/[id]/reparent (expensive subtree rewrite)                       |
| **dataExport**    | user      | 1 / 7d       | /api/user/export (W3 data export)                                          |
| **shareLink**     | user      | 10 / 1h      | /api/weekly/[id]/share                                                     |

Bolded limiters were added 2026-04-21. Fail-open posture when Upstash
isn't configured is unchanged — `redis` evaluates to null and
`enforceUserRateLimit` no-ops. Production must have
UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set for any of this
to actually enforce.

Acknowledged gaps (not addressed this sprint):

- Read endpoints are intentionally uncapped. Read-storm abuse is
  bounded by Vercel per-function concurrency + DB pool size; no
  single user can exhaust them meaningfully. If we see a noisy-reader
  problem, add `userRead: 240/1m`.
- /api/stripe/portal is not rate-limited. Stripe's session-creation
  throttles upstream; doubling up would get in the way of legitimate
  retries.
- Inngest-triggered paths (process-entry, weekly report, observation
  cron) are throttled by Inngest concurrency keys, not by this
  module.
