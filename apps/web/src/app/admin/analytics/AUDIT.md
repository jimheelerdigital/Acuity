# Admin Analytics Dashboard — Pass 1 Audit

**Date:** 2026-06-16 · **Author:** Claude Code · **Status:** Pass 1 (audit only, no code). Awaiting Jimmy's go for Pass 2.

> ⚠️ **Path correction:** the spec references `apps/web/app/admin/**`. This repo is `src`-rooted — the real path is **`apps/web/src/app/admin/**`**. All paths below use the real layout. (AUDIT.md is written to `apps/web/src/app/admin/analytics/AUDIT.md` — a `.md` file, so Next.js does not treat it as a route.)

---

## 1. Routing structure

The admin section is **a single tabbed dashboard, not a tree of routed pages.**

- `/admin` → `page.tsx` → renders `admin-dashboard.tsx` (client) with an **in-page tab bar** (state, not routes).
- `/admin/layout.tsx` → server component: **auth gate** (§2) + renders `<AdminTopbar/>` (sticky header, `bg-[#0A0A0F]/85`, logo + SessionUserMenu) above all `/admin/*` children.
- Other routed sub-areas: `/admin/dashboard`, `/admin/content-factory`, `/admin/blog-pruner-log`, and the **`/admin/adlab/*`** subsystem (its own `layout.tsx`; **middleware-gated to `keenan@heelerdigital.com` only** — `middleware.ts:46`).

**Nav pattern:** in-page `TABS` array in `admin-dashboard.tsx` (~line 22): `overview · funnel-analytics · users · ads · content · ai-costs · growth-metrics · business-metrics · settings`. Each tab is a client component under `admin/tabs/` that calls `useTabData(tab, start, end)` → `GET /api/admin/metrics?tab=<key>`.

**Where a new "Analytics" entry slots in — this is a design decision (see §8):** because the dashboard uses *in-page tabs* (state) but the spec wants *separate `/admin/analytics/*` routes*, the cleanest nav hook is a **single link in `admin/admin-topbar.tsx`** (the shared header on every admin page) → `/admin/analytics`. (Adding it to the `TABS` array would require a tab that `router.push`es out of the in-page model — awkward.)

---

## 2. Auth pattern — **reuse exactly, do not invent**

Two layers, both keying off `User.isAdmin`:

**Pages** — `admin/layout.tsx` (server) guards the whole `/admin/*` tree:
```ts
const session = await getServerSession(getAuthOptions());
if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin");
const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
if (!me?.isAdmin) redirect("/dashboard");
```
→ **New `/admin/analytics/*` pages inherit this automatically** (they're children of `/admin`). No per-page auth code needed.

**API routes** — `requireAdmin()` in **`apps/web/src/lib/admin-guard.ts`** (`import "server-only"`):
```ts
export async function requireAdmin(): Promise<
  | { ok: true; adminUserId: string }
  | { ok: false; response: Response }
>
```
Checks `getServerSession` (→ 401) then `User.isAdmin` (→ 403). **Canonical API call site** (`api/admin/drilldown/route.ts`):
```ts
const guard = await requireAdmin();
if (!guard.ok) return guard.response;
```
**Failure modes:** pages `redirect("/dashboard")`; API routes return `401 {"error":"Unauthorized"}` / `403 {"error":"Forbidden"}`.

→ **Pass 2: every `/api/admin/analytics/*` route opens with the `requireAdmin()` two-liner. Pages need nothing (layout covers them).**

---

## 3. API route pattern

- **Auth:** `requireAdmin()` (preferred) — a few older routes inline the same `getServerSession`+`isAdmin` check; new routes should use `requireAdmin()`.
- **DB access:** Prisma — `import { prisma } from "@/lib/prisma"` (or lazy `const { prisma } = await import(...)`). Mix of ORM (`.findMany/.count`) and **`prisma.$queryRaw<T>\`...\``** for aggregations. The validated SQL in the spec maps to `$queryRaw`. ⚠️ The spec's `$1::interval` placeholder is Postgres positional style; **Prisma uses tagged-template interpolation** — translate to `prisma.$queryRaw<Row[]>(Prisma.sql\`... NOW() - ${intervalString}::interval ...\`)` (or build the interval safely from the validated `range` enum, never from raw user input).
- **Response shape:** the metrics route returns `{ ...data, _meta: { cached, computedAt, durationMs } }`. New analytics routes can return **bare JSON** (data object) — matching `_meta` is optional/nice-to-have, not required.
- **Error logging:** `metrics/route.ts` wraps each sub-query in a `safe()` helper (returns fallback + `_error` key); elsewhere `console.error` / `safeLog`. No single central logger to wire into.

---

## 4. Styling + components

**Reusable admin components already exist at `apps/web/src/app/admin/components/`** — reuse these, don't rebuild:

| Component | Use |
|---|---|
| `MetricCard.tsx` | label + big value + delta% + CSS-bar sparkline + optional budget bar → the **stat cards** |
| `ChartCard.tsx` | `bg-[#13131F]` rounded-xl p-6 wrapper (title + children) → wrap every chart/table |
| `TimeRangeSelector.tsx` | range picker, emits `"7d"\|"30d"\|"90d"` + `onCustomChange(start,end)` → the **date filter** (see §8 — missing `60d`/`all`) |
| `SafeChart.tsx` | **recharts error boundary** (catches width/height/-1 crashes) → wrap any recharts chart |
| `SkeletonCard.tsx` | `SkeletonMetric/Chart/Table` loading states |
| `TabError.tsx`, `EmptyState.tsx`, `DrilldownModal.tsx` | error / empty / row-drilldown |

**Visual style — distinct dark admin tool, NOT the Acuity marketing brand:** bg `#0A0A0F`, cards `#13131F`, text `white/50–75`, accent purple **`#7C5CFC`**; secondary `#22D3EE` (Meta/cyan), `#34D399` (organic/green), `#FBBF24` (referral/amber). System sans, compact density. Tailwind primitives (no shadcn imports in admin).

**Data-fetching:** tabs are **client components** (`"use client"`) calling API routes via the `useTabData` hook — *not* server-component direct fetch. Match this: `/admin/analytics/*` pages = client components that fetch their `/api/admin/analytics/*` route.

---

## 5. Existing data + ⚠️ OVERLAP with the 5 spec reports (critical)

There are **already five analytics-ish tabs**, all fed by `/api/admin/metrics?tab=…` (`api/admin/metrics/route.ts`). The spec's 5 reports overlap heavily — this needs a decision (§8):

| Spec report | Already covered by | Net-new in spec |
|---|---|---|
| **Acquisition** (source×platform funnel) | `GrowthMetricsTab.signupsBySource`, `FunnelAnalyticsTab` | ✅ the **platform dimension** (meta-paid→web 19% vs →iOS 71%) + activation% per source×platform |
| **Activation** (signup→entry funnel + time-to-first) | `OverviewTab` web funnel, `GrowthMetricsTab.medianTimeToFirstRecording` | partial — the explicit 1/3/15-entry funnel steps |
| **Revenue** (MRR + sub health) | `BusinessMetricsTab` (mrrCents, revenue, payingUsers, ltv, etc.) — **heavy overlap** | ✅ the **stale-Stripe-records** + **PAST_DUE-recovery** reconciliation tables |
| **Features** (adoption, user-driven vs auto-seeded) | — none | ✅ **entirely new** |
| **Engagement** (one-and-done/dabbled/engaged/habit) | `GrowthMetricsTab.cohorts` (retention, different cut) | ✅ the **entry-count distribution** cohorts |

**Net-new value = Features, Engagement, the platform-dimension Acquisition, and the Revenue reconciliation tables.** Revenue-MRR and basic acquisition/activation **duplicate** existing tabs. Jimmy should decide: build all 5 as spec'd (accept duplication), or build net-new + link to existing tabs for the rest.

`BusinessMetricsTab` already computes MRR with a richer formula than the spec's estimate — worth aligning so two screens don't show different MRR numbers.

---

## 6. Charting

- **`recharts@^3.8.1` IS installed** (no new dependency needed). It's used in **non-admin** insights pages (`insights/life-map.tsx`, `insights/dimension-detail.tsx`).
- **Admin deliberately moved off recharts to CSS-bar charts** after width/height/-1 crashes — comments across `MetricCard/BusinessMetricsTab/AICostsTab/OverviewTab` say "Recharts removed — sparkline uses CSS bars." But the **`SafeChart` error boundary remains** as the sanctioned recharts wrapper.
- **Decision for Pass 2 (§8):** the spec asks for recharts `FunnelChart` + bars. Either (a) use recharts **wrapped in `<SafeChart>`** (honors the spec; SafeChart guards the known crash), or (b) match admin's CSS-bar convention. Recommend **(a) recharts + SafeChart** for the richer funnel/bar visuals, since it's already a dep and SafeChart exists for exactly this.

---

## 7. Risks / careful-of

- **Do not modify `api/admin/metrics/route.ts`** — it's large, cached, and feeds 6 tabs. Build **separate** `/api/admin/analytics/*` routes (the spec's layout) so nothing existing regresses.
- **`DASHBOARD_EPOCH = 2026-05-20`** clamps time-series in the *existing* metrics functions only. New raw queries using `NOW() - interval` are unaffected — but **"all-time"** range should still be bounded sensibly (the app's data starts ~May 2026).
- **`/admin/adlab/*` is middleware-gated to `keenan@` only** (`middleware.ts:46`). Analytics is general-admin (layout auth) — **don't touch adlab or middleware.**
- **`admin/tabs/FunnelAnalyticsTab.broken.tsx`** is a mid-refactor backup. Don't touch it or the active `FunnelAnalyticsTab.tsx`.
- **Caching:** spec says none for v1 (fine at 175 users). The admin convention uses `getCached()` + `TAB_TTLS` — we'll *diverge intentionally* (no cache) per spec; flag any query >500ms in dev.
- Queries are read-only aggregations; no locking concern at this scale. Keep them parameterized (validated `range` enum → interval string), never interpolate raw input.

---

## SUMMARY (for Jimmy)

**Auth I'll reuse:** `requireAdmin()` from `apps/web/src/lib/admin-guard.ts` on every `/api/admin/analytics/*` route (`const guard = await requireAdmin(); if (!guard.ok) return guard.response;`). Pages need **zero** auth code — `admin/layout.tsx` already guards all `/admin/*` children (redirect `/dashboard` if `!isAdmin`).

**Styling I'll match:** dark admin theme (`#0A0A0F`/`#13131F`/`#7C5CFC`) reusing `MetricCard`, `ChartCard`, `TimeRangeSelector`, `SafeChart`, `SkeletonCard`, `TabError` from `admin/components/`. Client-component pages + `fetch` to the API route (the `useTabData` pattern).

**Blockers / surprises:**
1. **Architecture mismatch** — admin is one *tabbed* dashboard; the spec wants *separate routed pages*. Both are viable; separate pages reuse the layout auth cleanly. **Needs your call** (Option A vs B below).
2. **Big overlap** — Revenue/Acquisition/Activation substantially duplicate existing `BusinessMetricsTab`/`GrowthMetricsTab`/`OverviewTab`/`FunnelAnalyticsTab`. Net-new = **Features, Engagement, platform-dimension Acquisition, Stripe-reconciliation tables**. Decide: build all 5 (duplication) or net-new + link out.
3. **recharts** is installed but admin chose CSS bars after crashes; `SafeChart` is the sanctioned recharts wrapper. Recommend recharts+SafeChart for the new pages.
4. **`TimeRangeSelector` lacks `60d` + `all`** (has 7/30/90) — extend it (1 file) to hit the spec's range set; its `"Xd"` values already match the spec's `?range=` param.
5. Path is `apps/web/src/app/...` not `apps/web/app/...`; Prisma `$queryRaw` uses tagged-template params, not `$1`.

**Recommended Pass-2 layout** (matches spec, reuses audited patterns):
```
apps/web/src/app/admin/analytics/
  page.tsx                 # index: 5 headline stat cards (MetricCard) + links
  acquisition/page.tsx     activation/page.tsx  revenue/page.tsx
  features/page.tsx        engagement/page.tsx       # client components
apps/web/src/app/api/admin/analytics/
  acquisition/route.ts … engagement/route.ts          # each opens with requireAdmin()
apps/web/src/lib/analytics/
  queries.ts   types.ts                                # $queryRaw fns + response types
```
Nav: one link in `admin/admin-topbar.tsx` → `/admin/analytics`. No cache. No migrations (read-only).

**Two decisions I need before Pass 2:**
- **(A)** Separate `/admin/analytics/*` pages *(recommended — matches spec, clean auth reuse)*, **or (B)** fold into the existing tabbed dashboard?
- **(C)** Build all 5 reports as spec'd (accepting Revenue/Acquisition/Activation overlap with existing tabs), or only the **net-new** ones (Features, Engagement, platform-Acquisition, Stripe-reconciliation) and link to existing tabs for the rest?
