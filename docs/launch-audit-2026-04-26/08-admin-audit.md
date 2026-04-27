# 08 — Admin scaffolding audit

**Status:** existing scaffolding survey (no code changes).
**Date:** 2026-04-27
**Goal:** know what's already built so the next admin work extends rather than duplicates.

## TL;DR

There is **no `super_admin` role and no `User.role` enum** in this codebase. Admin gating is a single boolean: `User.isAdmin` on the `User` model in `prisma/schema.prisma:85`. Granted manually via SQL update — not self-service.

A full admin app already exists at `/admin` with **13 tabs**, a dashboard layout that gates on `isAdmin`, **24 admin API routes** under `/api/admin/*`, an audit-log table (`AdminAuditLog`), an in-memory metrics cache, a feature-flag system with per-user overrides, and a content-factory approval queue. Two server-side gates are in use: `apps/web/src/app/admin/layout.tsx` (page tree) and `apps/web/src/lib/admin-guard.ts::requireAdmin` (API routes).

The "demo user" jim@heelerdigital.com sees the same UI as everyone else **except** that he hits `/admin` without being redirected away — assuming his `User.isAdmin` row in prod is `true`. Nothing in the code keys off his email. Outside `/admin`, no consumer-facing screen branches on `isAdmin`.

---

## 1. `super_admin` / `User.role` references

**Result: zero matches in `apps/web` for `super_admin`, `SUPER_ADMIN`, `superAdmin`, or `super-admin`.** No role enum on the `User` model. The only `User.role`-shaped identifier in the codebase is unrelated:
- Marketing landing pages have testimonials with a `role: "Founder"` field (`apps/web/src/app/for/founders/page.tsx`, `for/sleep/page.tsx`, etc.) — display-only props on quote cards.
- Anthropic SDK message arrays use `role: "user"` (LLM message role).

The actual admin gate is `User.isAdmin: Boolean @default(false)` (`prisma/schema.prisma:85`). The schema comment is explicit:

> Granted manually via direct DB update (`UPDATE "User" SET "isAdmin" = true WHERE email = '...'`). Not self-service. Gates `/admin/dashboard` + `/api/admin/*`.

## 2. Existing `/admin` route tree

A substantial admin app already exists. Tree under `apps/web/src/app/admin/`:

```
admin/
├── layout.tsx                        ← server-side gate (isAdmin or redirect /dashboard)
├── page.tsx                          ← renders <AdminDashboard />
├── admin-dashboard.tsx               ← 13-tab client shell, lazy-loaded tabs, ?tab= + ?range= URL state
├── components/
│   ├── ChartCard.tsx
│   ├── EmptyState.tsx
│   ├── MetricCard.tsx
│   ├── RecentAdminActions.tsx        ← reads /api/admin/audit
│   ├── RefreshButton.tsx
│   ├── SkeletonCard.tsx
│   └── TimeRangeSelector.tsx         ← 7d/30d/90d/custom
├── tabs/
│   ├── OverviewTab.tsx
│   ├── GrowthTab.tsx
│   ├── EngagementTab.tsx
│   ├── RevenueTab.tsx
│   ├── FunnelTab.tsx
│   ├── AdsTab.tsx
│   ├── AICostsTab.tsx
│   ├── ContentFactoryTab.tsx
│   ├── RedFlagsTab.tsx
│   ├── FeatureFlagsTab.tsx
│   ├── UsersTab.tsx                  ← search by email, drill-down detail, magic-link, extend-trial, soft-delete
│   ├── TrialEmailsTab.tsx
│   ├── GuideTab.tsx
│   └── useTabData.ts                 ← shared fetcher hooked at /api/admin/metrics?tab=…
├── dashboard/
│   ├── page.tsx                      ← 1-line `redirect("/admin")` (legacy URL)
│   └── admin-dashboard-client.tsx    ← older client (still imported? — see Notes)
└── content-factory/
    ├── page.tsx                      ← `redirect("/admin?tab=content-factory")` (legacy URL)
    └── content-factory-client.tsx    ← deeper Content Factory UI used inside the tab
```

**Tab → API → schema mapping** (24 admin API routes total under `apps/web/src/app/api/admin/`):

| Tab | API route(s) |
|---|---|
| Overview / Growth / Engagement / Revenue / Funnel / AI Costs / Red Flags | `GET /api/admin/metrics?tab=…&start=…&end=…[&refresh=true]` (single multiplexed route) |
| Ads | `GET/POST /api/admin/meta-spend` |
| Content Factory | `/api/admin/content-factory-data`, `/api/admin/content-factory/{approve,reject,edit,bulk-approve,unpublish,mark-distributed,generate-now}`, `/api/admin/content-factory/generate-status/[jobId]` |
| Red Flags | `GET/POST /api/admin/red-flags` |
| Feature Flags | `/api/admin/feature-flags`, `/api/admin/feature-flags/[id]`, `/api/admin/feature-flags/overrides`, `/api/admin/feature-flags/overrides/[id]` |
| Users | `GET /api/admin/users`, `GET/PATCH /api/admin/users/[id]`, `POST /api/admin/users/[id]/magic-link`, `POST /api/admin/users/[id]/extend-trial` |
| Trial Emails | `GET /api/admin/trial-emails`, `POST /api/admin/trial-emails/resend` |
| Audit panel | `GET /api/admin/audit` |
| Legacy | `GET /api/admin/dashboard` (older signups dashboard) |

**Supporting libs:**
- `apps/web/src/lib/admin-guard.ts` — `requireAdmin()` returns `{ ok, adminUserId }` or a 401/403 `Response`. Used by 6 admin routes (feature-flags x4, users x4, audit, extend-trial, magic-link).
- `apps/web/src/lib/admin-cache.ts` — in-memory TTL cache (`getCached`, `invalidateCache`, `invalidateCachePrefix`) for the `/api/admin/metrics` endpoint. Resets on redeploy. No Redis.
- `apps/web/src/lib/admin-audit.ts` — `logAdminAction()` writes to `AdminAuditLog` table; defines canonical `ADMIN_ACTIONS` slugs (feature-flag toggles, override upsert/delete, user soft-delete, extend-trial, send-magic-link). Never throws (audit failure is non-fatal).

**Schema models that exist for admin features:**
- `AdminAuditLog` (`prisma/schema.prisma:1298`) — immutable; `adminUserId`, `action`, `targetUserId`, `metadata: Json`, `createdAt`. Indexed on `(adminUserId, createdAt)`, `(targetUserId)`, `(createdAt)`. Never cascades on User delete.
- Feature-flag system: a flag table + per-user override table (referenced from `prisma/schema.prisma:1233+` and used by `feature-flags/overrides/route.ts`).

**Quick links bar** — the dashboard header includes external links to Supabase, Vercel, GA4, Stripe, Resend, Meta Ads, Inngest. Not gated separately; just `<a href>` tags.

## 3. Middleware enforcement

`apps/web/src/middleware.ts`:

```ts
export { default } from 'next-auth/middleware'
export const config = {
  matcher: [
    '/home/:path*', '/dashboard/:path*', '/record/:path*',
    '/tasks/:path*', '/goals/:path*', '/insights/:path*', '/upgrade/:path*',
  ],
}
```

**Key finding: `/admin` is NOT in the middleware matcher.** Middleware only forces a NextAuth session on the user-facing app routes. There is no edge-level role check at all.

`/admin` enforcement happens entirely in the **layout server component** (`apps/web/src/app/admin/layout.tsx`):

1. `getServerSession()` — no session ⇒ `redirect("/auth/signin?callbackUrl=/admin")`.
2. `prisma.user.findUnique({ select: { isAdmin: true } })` — not admin ⇒ `redirect("/dashboard")`.

API routes have their own server-side gate (`requireAdmin()`) since the layout doesn't run for `fetch()` calls. Both the layout and `requireAdmin` use the **same field check** (`isAdmin: true`) — no divergence.

`apps/web/src/app/robots.ts:10` disallows `/admin/` for crawlers, so SEO index leak is already covered.

## 4. What jim@heelerdigital.com sees that other users don't

**Exactly one thing: access to `/admin` and the `/api/admin/*` surface.** The admin status comes from `User.isAdmin = true` in the database — nothing keys off the email string itself.

Confirmed by grepping for `jim@heelerdigital`, `heelerdigital`, `ADMIN_EMAIL`, `ADMIN_USER`, `admin@`. The matches are unrelated:
- `apps/web/src/app/support/page.tsx:39,42,169` — public mailto link (support inbox).
- `apps/web/scripts/send-test-magic-link.ts:66,75` — test script using `keenan@heelerdigital.com`.
- `apps/web/src/app/api/waitlist/route.ts:71` — waitlist notifications go to keenan@.
- `apps/web/src/tests/auth-flows.test.ts:73` — fixture email.
- `apps/web/src/lib/apple-jwks.ts:65` — Apple bundle ID `com.heelerdigital.acuity` (unrelated).

**No consumer-facing branching on `isAdmin`.** `/api/user/me/route.ts:15` explicitly does **not** expose `isAdmin` to the client, so the mobile app and the web home/dashboard cannot tell who is or isn't an admin. The only places that read `isAdmin` outside the gate are:

- `apps/web/src/app/admin/tabs/UsersTab.tsx:19,293` — admin viewing other users' detail panels sees an `isAdmin` badge.
- `apps/web/src/app/api/admin/users/[id]/route.ts:45,77` — returns it as part of the user-detail response for the admin Users tab.
- `apps/web/src/app/api/test-sentry-error/route.ts:34` — gates a Sentry self-test endpoint behind `isAdmin`.

So in practice: if Jim's prod row has `isAdmin = true`, the only difference is that `/admin` loads instead of redirecting him to `/dashboard`. There is no "demo user" branching anywhere — no hardcoded email, no "if user.id === '…'" fork, no preview-mode flag. Mobile bundle search returns only Sentry/Supabase auto-instrumented `isAdmin` strings (not application code).

## Suggestions before extending

1. **Stay on the `isAdmin` boolean unless the business needs tiered admin roles.** Adding a `super_admin` enum is a real lift: every existing route's `select: { isAdmin: true }` and the layout gate would need migrating, plus a Prisma push from Jim's home network. There's no existing role plumbing to lean on. If a "Keenan can approve content but can't grant admin / soft-delete users" requirement actually shows up, that's the time — pick `User.role` with an enum (`ADMIN | EDITOR | VIEWER`) and migrate `isAdmin` to a derived check.
2. **New admin API routes should use `requireAdmin()` from `@/lib/admin-guard`**, not re-roll the inline `isAdmin` lookup. About 18 of the 24 existing routes still inline it (predates the helper). Worth a low-priority cleanup pass to consolidate.
3. **Use the existing `ADMIN_ACTIONS` slugs in `lib/admin-audit.ts`** and add new slugs there, not inline. The Overview audit panel uses these slugs to render readable labels.
4. **Consider adding `/admin` to the middleware matcher** so unauthenticated hits get a session redirect at the edge instead of in the server component — same behavior, slightly cheaper. Low priority; the layout gate is correct as-is.
5. **The `dashboard/admin-dashboard-client.tsx` file looks like dead/legacy code** (the route just redirects to `/admin`). Confirm before extending — could be ripped out, or the new top-level `/admin` page may have intentionally kept it as a fallback.

## Notes

- The schema comment on `isAdmin` is the single source of truth for how admin status is granted: a manual `UPDATE` from Supabase. The Users tab does **not** expose a "promote to admin" button, on purpose.
- `AdminAuditLog` is set up to retain history even if the admin's User row is deleted (`Never cascades on User delete`). Worth preserving that property if any new admin-write feature lands.
- The Content Factory tab is by far the biggest sub-feature inside admin (separate page tree at `/admin/content-factory`, ~1000-line client). Any "admin v2" reshape needs to keep that surface intact or migrate it deliberately.
- Two URL aliases exist for backward compat: `/admin/dashboard` → `/admin`, `/admin/content-factory` → `/admin?tab=content-factory`. Don't break those without a redirect.
