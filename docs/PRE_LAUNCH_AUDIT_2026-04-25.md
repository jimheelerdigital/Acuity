# Pre-Launch Production Audit — 2026-04-25

Two parallel audits run on commit `611348d`: performance/latency and security. Single record of findings. Severity-ordered.

---

## CRITICAL (must fix before go-live)

| # | File | Issue | Fix |
|---|---|---|---|
| 1 | `apps/web/src/lib/bootstrap-user.ts:164` | **Trial-farming via Gmail plus-addressing.** `alice+spam@gmail.com` lands in the same inbox as `alice@gmail.com` but bypasses the DeletedUser tombstone, granting infinite 14-day trials. | Strip everything after `+` before lookup: `email.split('+')[0].toLowerCase().trim()`. |
| 2 | `apps/web/src/lib/referrals.ts:23` | **Referral codes use `Math.random()`** — predictable per V8 session, 32⁸ entropy. Attacker can guess codes and hijack credit. | Switch to `crypto.randomBytes(8)` mapped to the alphabet. |
| 3 | `apps/web/src/app/api/stripe/webhook/route.ts:33-36` | **Webhook signature error leaks SDK message** — attackers can iterate forgery attempts with feedback. | Return opaque `{ error: "Invalid webhook signature" }`; log raw error server-side only. |
| 4 | `apps/web/src/app/api/record/route.ts:111-113` | **`durationSeconds` accepts `Infinity`/negatives/`NaN`.** Corrupts `Entry.audioDuration` and silently breaks downstream. | Clamp: `Math.max(1, Math.min(3600, Number(value)))`. |
| 5 | `apps/web/sentry.edge.config.ts:11-18` | **Edge runtime Sentry has no PII scrubbing.** Middleware exceptions can ship plaintext emails, session cookies, auth headers to Sentry. | Apply the same `beforeSend`/`beforeBreadcrumb` scrub hooks already on `sentry.server.config.ts:11-42`. |
| 6 | `apps/web/src/app/api/insights/comparisons/route.ts:125-128` | **Unbounded full-table scan** — fetches ALL Entry rows for "days journaled". OOM/timeout on power users at scale. | `take: 10000` + date-window filter, or precompute via Inngest cron. |
| 7 | `prisma/schema.prisma` (Task model) | **Missing `@@index([userId, status])`.** Every task list load is a full table scan. Single biggest read-path risk. | Add the index, run `prisma db push`. |
| 8 | `apps/web/src/app/admin/content-factory/content-factory-client.tsx` | **2-second polling** = 1,800 req/hr/admin. Multiple admins will starve the connection pool. | Bump to 8-10s with exponential backoff, or move to SSE. |

---

## HIGH (fix before public launch)

**Security**

- `apps/web/src/app/api/goals/route.ts` + `tasks/route.ts` — **No length caps** on `title`/`description`/`transcript`. 50MB string POST = DB bloat + OOM on list renders. Add Zod `.max(500)` / `.max(50000)` and Prisma `@db.VarChar(500)`.
- `apps/web/src/app/api/stripe/webhook/route.ts:64-77` — **`session.customer`/`session.subscription` cast to string with no null check.** Incomplete events 5xx the webhook. Add explicit type guards.
- `apps/web/src/lib/posthog.ts:99-128` — **Server-side analytics ignore `cookieConsent.analytics`.** GDPR violation for EU users. Gate `track()` calls on consent state.
- `apps/web/src/app/api/auth/signup` — **No IP-based rate limit** (only per-email). Combined with #1 enables industrial trial farming. Add `rateLimit(limiters.signupByIp, getClientIp(req))` at 3-5/hr.
- `apps/web/src/lib/pipeline.ts` + `embeddings.ts` — **No timeout on Anthropic/OpenAI SDK calls** (default 10 min). Stuck upstream burns Vercel function duration $. Wrap with `AbortController` at 30s.

**Performance**

- `apps/web/src/app/api/insights/theme/[themeId]/route.ts:110-119` — Co-mentions query loads all theme rows then filters in JS. `take: 500` + paginate.
- `apps/web/src/app/api/goals/suggestions/route.ts:44-50` — N+1 on entry summaries. Switch to `include: { sourceEntry: { select: {...} } }`.
- `apps/web/src/app/api/user/referrals/route.ts:56-69` — **Up to 5 sequential Prisma queries** in a loop on every referrals GET for legacy users. Pre-generate at signup or move to Inngest.
- `apps/web/src/app/waitlist/page.tsx`, `auth/signin/page.tsx`, `auth/signup/page.tsx` — **Raw `<img>` tags** for logo, no `next/image`, layout-shift on load. Replace with `Image` component.

---

## MEDIUM (fix within 30 days post-launch)

- `apps/web/src/app/insights/page.tsx` + `home/page.tsx` — `export const dynamic = "force-dynamic"` disables CDN caching. Re-enable with `revalidateTag` invalidation. ~80% reduction in DB load on repeat visits.
- `apps/web/src/app/**` — **Zero `loading.tsx` files** across 169 route directories. Add skeletons to `/insights`, `/home`, `/goals`, `/entries`.
- `apps/web/src/app/api/insights/observations/route.ts:31-35` — In-memory sort after unordered fetch. Use DB `orderBy: [{ severity: "desc" }, { createdAt: "desc" }]`.
- `apps/web/src/app/home/page.tsx:99-100` — `Promise.all` of 5 queries, no per-query timeout. `Promise.allSettled` with timeouts.
- `apps/mobile/lib/cache.ts` — Cache layer not used by all `api.get` calls. Audit for callsites that bypass `useCachedResource`.
- `apps/web/src/lib/pipeline.ts:430-435` — Silent `.catch()` on FAILED-state write. Entry stays PENDING forever with no Sentry trace.
- `apps/web/next.config.js` — Verify CSP is `script-src 'self' 'nonce-...'` with no `unsafe-inline`. We hardened CSP for Stripe + OAuth; needs re-verification.
- `apps/web/src/app/api/goals/route.ts:135-137` — Trim without `.max()` cap. Enforce slice on insert.

---

## LOW

- 69 client components could be server components (presentational `EntryCard`, `Greeting`). Reduces JS bundle. Audit case-by-case.

---

## Categories with zero findings

- **IDOR / authorization** — `getAnySessionUserId` consistently applied; no routes accept `userId` from body/query.
- **XSS** — DOMPurify in place on user-rendered content.
- **SQL injection** — Prisma parameterization throughout; no `$queryRaw` with string interp.
- **Cookie security** — HttpOnly/Secure/SameSite all set on session cookies.
- **CORS** — NextAuth manages it correctly; mobile bearer-token routes scoped properly.
- **Mobile deep-linking** — PKCE validated on OAuth flow.
- **Mobile token storage** — Already on `expo-secure-store`, not AsyncStorage.

---

## Pre-launch shipping plan

Bundling 8 fixes into a single PR:
- All five CRITICALs (#1, #2, #3, #4, #5)
- IP-based signup rate limit
- Anthropic/OpenAI SDK 30s `AbortController` timeouts
- Length caps on goals/tasks (Zod + `@db.VarChar`)

**Deferred:**
- CRITICAL #7 (`Task @@index([userId, status])`) — schema change requires coordinated `prisma db push` from Jimmy's home network. Flag as follow-up.
- CRITICAL #6 (unbounded `comparisons` query) — moved to first-week-post-launch list since it only fires on power users with 1000+ entries; we have zero such users today.
- CRITICAL #8 (admin polling 2s → 10s) — admin-only surface, no public exposure, defer to post-launch.
- All HIGH (perf), MEDIUM, and LOW items.
