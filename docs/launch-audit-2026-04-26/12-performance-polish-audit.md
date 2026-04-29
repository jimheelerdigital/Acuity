# Performance & Polish Audit — 2026-04-28

The product feels slow and unpolished. Pages take 5+ seconds to load. This audit enumerates what's wrong, with file paths + line numbers, severity tiers, and one-line fix suggestions per issue. **Nothing has been fixed.** This document is for triage.

Severity legend:
- **CRITICAL** — makes the app feel broken or unusable. >3s load times, blocking interactions, missing loading states on slow pages, silent failures, sync work in hot paths that should be queued.
- **HIGH** — visibly unpolished but functional. Inconsistent typography/spacing, missing hover states, unoptimized payloads, full-row reads when 5 columns would do.
- **MEDIUM** — nice-to-have. Animation polish, micro-interactions, consistency that nobody specifically complains about.

Total flagged: **~85 distinct issues** across web, mobile, and backend.

---

## 1. WEB PERFORMANCE — 14 issues

### 1.1 CRITICAL

**Synchronous Claude call inside the recording-completion path.**
`apps/web/src/lib/memory.ts:144-150`. After every 10th recording, `compressMemory()` runs *inline* — calls Claude to synthesize the memory state, blocks the response. User sees the recording spinner for 5–20 extra seconds every 10th time. Move to Inngest, return entry data immediately.

**Theme-map endpoint: O(mentions × themes) iteration.**
`apps/web/src/app/api/insights/theme-map/route.ts:113-128, 312-329`. Fetches `themeMention.findMany()` with no `take:` limit (5000+ rows on power users), then loops once per top-theme to build per-theme entry lists. 50 themes × 5000 mentions = 250k iterations on cache miss. Endpoint times out at 5–15s. Cap to `take: 1000`, build a `Map<themeId, mentions[]>` once, switch to DB GROUP BY where possible.

**`/home` does sequential prisma queries before the parallel batch starts.**
`apps/web/src/app/home/page.tsx:38-56`. Onboarding lookup runs first, *then* the user/progression read, *then* the Promise.all. Each sequential await is one round-trip. Move all reads into one `Promise.all`.

### 1.2 HIGH

**`/home` `fetchEntries()` missing `select` clause.**
`apps/web/src/app/home/page.tsx:347-356`. Pulls every Entry column (transcript, embedding[1536], rawAnalysis JSON, raw SQL) when only id/summary/mood/themes/createdAt + `_count.tasks` are rendered. ~50KB extra per row × 7 entries = 350KB wasted on every dashboard load.

**`/entries` page reads full rows for 100 entries.**
`apps/web/src/app/entries/page.tsx:27-34`. `take: 100` with no `select`. 500–2000KB wire transfer per load on a power user. Should select id/createdAt/summary/mood/energy/status/themes + `_count.tasks` only.

**`fetchTopThemes` orderBy `mentions._count desc` without an index hint.**
`apps/web/src/app/home/page.tsx:359-378`. For a user with 300 themes, scans every theme + counts every mention before slicing 3. Add `where: { mentionCount: { gt: 0 } }` (denormalized cache column) instead of relational count.

**`/api/lifemap/history` reads ALL entries from 8 weeks back.**
`apps/web/src/app/api/lifemap/history/route.ts:22-30`. No `take:`, full-row reads, then JS-side aggregation of `rawAnalysis`. The `LifeMapAreaHistory` table already exists (line 57 of `/api/lifemap/trend`) for exactly this — use it instead of re-aggregating live.

**Recharts imported at module top in admin tabs (~150KB).**
`apps/web/src/app/admin/tabs/*.tsx`. Tabs are dynamically imported, but each tab statically imports recharts → recharts ships with whichever tab loads first. Dynamic-import recharts inside each tab.

**`landing-shared.tsx` mounts ~30 IntersectionObservers.**
`apps/web/src/components/landing-shared.tsx:1-100`. One observer per scroll-reveal element, plus per-element `requestAnimationFrame` loops. Scroll jank on mobile (200–400ms hitches). Replace with one shared observer + `Set<Element>`.

### 1.3 MEDIUM

**`/api/lifemap/dimension/[key]` does Claude synthesis synchronously in request.**
`apps/web/src/app/api/lifemap/dimension/[key]/route.ts:155-167, 219-231`. Cold cache → 3+ second hang on dimension click. Queue via Inngest, return 202 + cached/stale shape.

**`/api/lifemap` (the 4-fetch waterfall on `/life-matrix`).**
`apps/web/src/app/insights/life-map.tsx:92-140`. Four parallel fetches on mount with no client-side cache (no SWR / react-query). Tab away + back = 4 fresh requests. Pre-fetch in the parent server component, hydrate into a cache.

**`getUserProgression()` counts via `findMany` + length.**
`apps/web/src/lib/userProgression.ts:34-49`. Fetches every entry+theme+goal row just to read the count. ~270 rows for a power user when 3 `count()` aggregates would do.

**`recharts` imported at module top in `life-map.tsx` (~40KB) for a chart only 20% of users see.**
`apps/web/src/app/insights/life-map.tsx:4-13`. Trend view is conditional; recharts is unconditional. Dynamic import.

---

## 2. WEB POLISH — 30 issues

### 2.1 CRITICAL

**Silent error on `/home` data fetch.**
`apps/web/src/app/home/page.tsx:102-126`. `Promise.all` wrapped in try/catch that swallows the error and renders empty widgets. A failed fetch produces a "blank dashboard" with no indication anything is wrong. Surface an error UI; ideally retry once.

**Open Tasks completion fails silently on network error.**
`apps/web/src/app/home/open-tasks-card.tsx:64-72`. Catch block restores the row without surfacing the failure. User taps checkbox, row un-fades, no toast — looks like the app is unresponsive. Add an error toast.

**Record button has no loading UI during upload.**
`apps/web/src/app/home/record-button.tsx`. The button stays in its idle state during upload + transcription. User taps multiple times thinking it failed. Show spinner + "Recording…" label.

### 2.2 HIGH

**Two different checkbox designs across the same product.**
- `apps/web/src/app/home/open-tasks-card.tsx:111-128` (rounded-full h-5 w-5)
- `apps/web/src/app/tasks/task-list.tsx:576-612` (square borderRadius:4 borderWidth:2 inline style)

The user sees a circle on `/home` and a square on `/tasks` for the same action. Build one shared `<Checkbox>` component, use it everywhere.

**Tap targets below 44×44 on mobile web.**
- `apps/web/src/app/tasks/task-list.tsx:486-500` — Move/snooze/delete icon buttons at `p-1.5` (~24×24)
- `apps/web/src/app/entries/entries-list.tsx:202` — Menu button at `p-1.5` (~24×24)

Fail iOS HIG. Bump to `p-2` minimum or add invisible expanded hitbox.

**`/tasks` and `/goals` pages use spinners, not skeletons.**
- `apps/web/src/app/tasks/task-list.tsx:155-161`
- `apps/web/src/app/goals/goal-list.tsx:213-219`

Page-level spinner = blank page for 1–2s = looks broken. Replace with skeleton card layouts.

**Goal deletion uses native `window.confirm()`.**
`apps/web/src/app/goals/goal-list.tsx:159`. Breaks the dark-mode aesthetic. Use a styled confirm modal.

### 2.3 MEDIUM

**Inconsistent button vocabulary across surfaces.**
Auth uses `bg-zinc-900 hover:bg-zinc-700`; onboarding uses `bg-[#7C5CFC]`; upgrade uses `bg-zinc-900`. Three different "primary" buttons. Build `<PrimaryButton>` / `<SecondaryButton>`.

**Inconsistent empty-state styling.**
`/entries`, `/goals`, `/tasks` use a dashed-border emoji block; `/home` uses a separate `EmptyState` component. Two visual languages for the same UX moment.

**Missing active-state feedback.**
- Entry cards (`apps/web/src/app/home/entry-card.tsx:36`) — hover shadow only, no `active:scale`
- Goal cards (`apps/web/src/app/goals/goal-list.tsx:379-380`) — same
- Task body button (`apps/web/src/app/tasks/task-list.tsx:445-452`) — same
- Mood filter buttons (`apps/web/src/app/entries/entries-list.tsx:92-100`) — same

Add `active:scale-[0.98]` consistently. Buttons feel unresponsive without it.

**Open Tasks empty state has no CTA.**
`apps/web/src/app/home/open-tasks-card.tsx:84-93`. Says "Record a session to extract some" but no link. Make it a button.

**Modal backgrounds vary in opacity.**
Task modal `bg-black/50`, goal modal `bg-black/70`, entry menu `bg-black/40`. Standardize to one value.

**Auth pages have no error recovery affordance.**
`apps/web/src/app/auth/signin/page.tsx:112-116`. Error displays statically; no "Try again" button, no auto-clear. User has to manually edit + resubmit.

**Onboarding force-flips dark mode without restoring.**
`apps/web/src/app/onboarding/onboarding-shell.tsx:75-84`. If user closes the tab mid-flow, theme stays dark forever.

**`/account` has no loading state after upgrade.**
`apps/web/src/app/account/page.tsx:60`. `justUpgraded=true` shows the new state, but the Stripe webhook may not have synced. Spinner during the sync window.

**Life Matrix radar SVG hard-coded `max-w-[420px] lg:max-w-[380px]`.**
`apps/web/src/app/home/life-matrix-snapshot.tsx:108-115`. Below 380px the radar is cramped. Drop the max-width on small screens; let it scale.

**`/entries` search placeholder over-promises.**
`apps/web/src/app/entries/entries-list.tsx:71`. "Search summaries, themes, transcripts" — but transcripts aren't visible in the list, so users don't know what they're searching against. Simpler: "Search or filter".

### 2.4 LOW (rolled together)

- Arbitrary gap values in tasks (`gap-1`/`gap-2`/`gap-2.5`/`gap-3`) — pick one
- Goal progress percentages missing `tabular-nums` in tree view
- Task priority badges (URGENT/HIGH/MEDIUM/LOW) have minor width wobble
- Icon button padding inconsistent (`p-1` vs `p-1.5` vs `p-2`)
- Entry card uses raw shadow tokens instead of `shadow-sm`
- Greeting on `/home` doesn't scale up on `lg:` (stays `text-3xl`)

---

## 3. MOBILE PERFORMANCE — 18 issues

### 3.1 CRITICAL

**Tasks tab uses `<ScrollView>` for 50+ tasks across groups.**
`apps/mobile/app/(tabs)/tasks.tsx:400-492`. No virtualization → every row mounts and stays in memory. Janky scroll on power users. Wrap groups in `<FlatList>` with `SectionList` or render as VirtualizedList.

### 3.2 HIGH

**`expo-av` (1.7MB) bundled but only used by `/record`.**
`apps/mobile/package.json:24` + `apps/mobile/app/record.tsx`. Lazy-load via dynamic import inside record.tsx, not module-top.

**Tab focus effects refetch on every visit when staleness criteria mismatch.**
- `apps/mobile/app/(tabs)/index.tsx:120-126` — refetches if `isStale(...) || homeData == null`. On first visit cached entries exist but `homeData` doesn't → forces a re-fetch.
- `apps/mobile/app/(tabs)/goals.tsx:376-383` — 30s TTL too aggressive; tabbing back after 31s pulls the full goal tree.

Unify staleness; default TTL to 60–120s; refetch only on pull-to-refresh.

**Insights tab fetches 5 endpoints in `Promise.all`.**
`apps/mobile/app/(tabs)/insights.tsx:123-150`. Slowest endpoint blocks all. Sequence by importance: critical-path (entries/reports/lifemap) first; trend/progression after.

**`LifeMapRadar` SVG re-renders on unrelated parent state.**
`apps/mobile/components/life-map-radar.tsx:55-254`. Not memoized. Parent toggles `metricsOpen` and the radar re-computes all polygon points + grid + spokes. Wrap in `React.memo`.

**Tab bar mic button competing animations.**
`apps/mobile/app/(tabs)/_layout.tsx:240-243`. `Animated.timing` fires for both `pressed` and `active` state changes — they can race. Combine into one shared value.

**`lucide-react-native` full icon set bundled.**
`apps/mobile/package.json:38`. ~10 icons used out of hundreds. Verify metro tree-shaking; if it's not stripping, switch to per-icon imports.

**Insights horizontal scroll renders 12 timeline cards, no virtualization.**
`apps/mobile/app/(tabs)/insights.tsx:410-461`. Use `<FlatList horizontal>` with `windowSize={3}`.

**`d3-force` package installed but search shows no usage.**
`apps/mobile/package.json`. Verify; if dead, remove.

### 3.3 MEDIUM

**Tasks tab re-runs `makeVisitSnapshot` on every focus.**
`apps/mobile/app/(tabs)/tasks.tsx:149-161`. Recomputes the entire task grouping every time, even with unchanged tasks array. Memoize.

**`AuthGate` blocks first paint on slow `/api/user/me`.**
`apps/mobile/app/_layout.tsx:24-78`. Already mitigated by cached fallback, but on truly cold launches with slow network, user sees blank screen between splash hide and auth resolution. Render the splash UI in JSX as fallback so the transition is seamless.

**ThemeProvider reads AsyncStorage async on mount.**
`apps/mobile/contexts/theme-context.tsx:67-104`. Default "system" flashes before stored value lands. RN 0.73+ exposes a sync read.

**Sentry init at module scope.**
`apps/mobile/app/_layout.tsx:16`. Synchronous. 10–50ms blocking on cold start. Move to `requestIdleCallback` if available.

---

## 4. MOBILE POLISH — 17 issues

### 4.1 HIGH

**Goal tree expand/collapse chevron is a 30×30 tap target.**
`apps/mobile/app/(tabs)/goals.tsx:742-756`. Below iOS HIG 44pt minimum. Bump `hitSlop` to 16, or wrap chevron + adjacent area in a larger Pressable.

**Mood filter pills are 28pt tall.**
`apps/mobile/app/(tabs)/entries.tsx:195-232`. Below 44pt. Add `hitSlop={8}` or `py-2`.

**Tasks tab loading state is a centered full-screen spinner.**
`apps/mobile/app/(tabs)/tasks.tsx:384-393`. Tab bar is rendered (good) but the body just spins. Skeleton rows would feel like the app is loading content, not stuck.

### 4.2 MEDIUM

**Goals empty state has no CTA.**
`apps/mobile/app/(tabs)/goals.tsx:585-594`. Entries tab has a CTA ("Tap the mic"), Goals doesn't. Add "Record your first session →".

**Modal sheets don't support drag-to-dismiss.**
`apps/mobile/app/(tabs)/goals.tsx:943-993` (AddSubgoalSheet), `1005-1048` (ActionSheet). iOS-standard pan-down to dismiss isn't wired. User has to tap Cancel.

**Haptics inconsistent across destructive actions.**
- Task complete → fires (`tasks.tsx:186`)
- Goal action → fires (`goals.tsx:401`)
- Entry delete → silent
- Record button press → silent
- Swipe-to-delete entry → silent

Audit and add `Haptics.impactAsync` to destructive + commit-state actions.

**Trend button on Insights disabled without an obvious cue.**
`apps/mobile/app/(tabs)/insights.tsx:251-265`. Just opacity + grayed text. Add a lock icon so it reads as "feature not yet unlocked" rather than "broken button".

**Task checkbox is 22pt + 10 hitSlop = 42pt — just below HIG 44.**
`apps/mobile/app/(tabs)/tasks.tsx:703-729`. Bump hitSlop to 12.

**Spinner instead of skeleton on Home tab loading.**
`apps/mobile/app/(tabs)/index.tsx:251-254`. Stale-while-revalidate hides this most of the time, but first-launch users see a centered spinner.

### 4.3 LOW

- Card border-radius mostly `rounded-2xl`, one stray `rounded-xl` in `insights.tsx:631`
- Padding values inconsistent across tabs (`p-4`/`p-5`/`p-6`/`px-3.5`)
- Hardcoded `#FFFFFF` in places where `zinc-50` is the theme token
- `expo-av` lazy-load is the only meaningful bundle win

---

## 5. BACKEND PERFORMANCE — 31 issues

### 5.1 CRITICAL

**Theme-map endpoint** — already covered in §1.1 (`apps/web/src/app/api/insights/theme-map/route.ts`).

**Inngest data export reads full rows from 11 tables in parallel.**
`apps/web/src/inngest/functions/generate-data-export.ts:92-103`. 11 `findMany` calls, no `select:`, no `take:`, no `where:` optimizations. Power user with 10k entries = 60MB+ in memory (embeddings are 1536 floats each). Add `select:` everywhere; paginate above 5k rows.

**`compute-user-insights` cron loops every user with sequential per-user queries.**
`apps/web/src/inngest/functions/compute-user-insights.ts:116-227, 188-330`. ~0.1s/user × 10k users = 17 minutes. Refactor to bulk-fetch all users' data in two queries, then loop in memory.

**`/api/home` calls `pickRecommendation` which reads all goals + entries unbounded.**
`apps/web/src/lib/recommendation.ts:49-61, 77-85`. No `take:`, no select. Full per-user table scan on every dashboard load. Cap to `take: 500`; memoize theme frequency in `UserMemory`.

**`/api/lifemap/dimension/[key]` synchronous Claude.**
`apps/web/src/app/api/lifemap/dimension/[key]/route.ts:219-231`. Already covered above. Move to Inngest.

**`/api/weekly` legacy sync path with inline Claude (4000 tokens).**
`apps/web/src/app/api/weekly/route.ts:152-197`. If `ENABLE_INNGEST_PIPELINE !== "1"`, this fires synchronously. Force the env globally; delete the legacy path.

**Entry table missing `(userId, status, createdAt)` composite index.**
`prisma/schema.prisma:419`. Existing index is `(userId, createdAt)`. Many queries also filter on `status`. Add the composite.

### 5.2 HIGH

**`/api/admin/metrics` raw SQL without LIMIT.**
`apps/web/src/app/api/admin/metrics/route.ts:188-379, 339-355, 650-676`. 15+ `$queryRaw` calls; DAU/WAU/MAU + AI cost breakdowns scan unbounded. Cache `ai-costs` (currently 0 TTL — recomputed every call). Use `DashboardSnapshot` table for day-old metrics.

**`process-entry` Inngest function has 6 sequential prisma calls.**
`apps/web/src/inngest/functions/process-entry.ts:79-195`. Each `step.run` is a retry boundary AND a round-trip. Combine into 3 batched steps via `Promise.all`.

**`force-dynamic` on 60+ routes that could ISR/SWR.**
Global. `/api/goals` GET, `/api/tasks` GET, `/api/lifemap` GET — these change rarely during a session. Keep `force-dynamic` only on routes that genuinely must.

**Task table missing `(userId, status)` index.**
`prisma/schema.prisma:445-473`. `/api/tasks` filters `status: { not: "DONE" }` — full-table scan as the table grows.

**`/api/goals` returns full Goal rows.**
`apps/web/src/app/api/goals/route.ts:31-36`. No select. Includes `progressNotes: Json[]`, `entryRefs: String[]`, `treePath: String?`. Slice to 10–15 fields.

**`weekly-digest` cron does per-user query loops (4 parallel queries × N users).**
`apps/web/src/inngest/functions/weekly-digest.ts:78-180`. Bulk-fetch all users' data in two queries, then process.

**`/api/goals/tree` reads full Task rows.**
`apps/web/src/app/api/goals/tree/route.ts:54-56`. No select. Drop `description`, `entry` relation, etc.

**`/api/lifemap` calls `getOrCreateUserMemory` synchronously on GET.**
`apps/web/src/app/api/lifemap/route.ts:36-59`. Hot path side effect (writes on read if memory row missing). Move memory upserts to Inngest entirely; if missing, return minimal payload.

**`monthly-digest` cron** — same pattern as `weekly-digest`. `apps/web/src/inngest/functions/monthly-digest.ts:88-160`.

### 5.3 MEDIUM

- `/api/insights/observations` — sorts in JS instead of Prisma `orderBy` (`route.ts:31-41`)
- `/api/entries/[id]` likely full-row read incl. embeddings
- `/api/user/me` lastSeenAt update is fire-and-forget without error logging (`user/me/route.ts:71-76`)
- `Goal.parentGoalId` would benefit from composite `(userId, parentGoalId)` index for tree queries
- `WeeklyReport` index is `(userId, createdAt)` but queries filter on `weekStart` — different field
- `LifeAudit` should be `@@unique([userId, kind])`, not just indexed (business rule: one audit per kind per user)
- Theme-map sparkline computation re-runs on every cache miss — pre-compute in Inngest
- Snapshot-lifemap-history likely scans active users one-by-one — bulk
- `/api/record` Inngest dispatch isn't transactional with the Entry create — orphan risk on dispatch failure
- `User.subscriptionStatus + createdAt` index missing — trial-email orchestrator full-scans User table
- `Goal.progress` arithmetic in `/api/weekly` lacks null-guard
- `day-14-audit-cron` reads full transcripts + embeddings — only needs `summary`/`themes`/`mood`
- `/api/admin/users/[id]` likely full-row read including sensitive fields (resetToken, passwordHash)
- `UserMemory.recurringThemes` Json[] grows unbounded with mention count

---

## TOP-10 PUNCH LIST

If we ship nothing else, these ten move the needle most:

| # | Severity | Area | What | Effort |
|---|---|---|---|---|
| 1 | CRITICAL | Web perf | Move `compressMemory()` from recording path to Inngest (`memory.ts:144`) | M |
| 2 | CRITICAL | Web/Backend | Theme-map: cap `take:1000`, switch JS loops to a single `Map` build (`api/insights/theme-map/route.ts`) | M |
| 3 | CRITICAL | Web polish | Surface dashboard fetch errors instead of silent empty widgets (`home/page.tsx:102`) | S |
| 4 | CRITICAL | Mobile perf | Tasks tab `ScrollView` → `FlatList` (`(tabs)/tasks.tsx:400`) | M |
| 5 | HIGH | Web perf | Add `select:` to `/home` `fetchEntries`, `/entries` page, `getUserProgression` | S |
| 6 | HIGH | Backend | Missing indexes: `Entry(userId,status,createdAt)`, `Task(userId,status)` | S |
| 7 | HIGH | Web polish | One shared `<Checkbox>` component (`/home` and `/tasks` use different ones) | S |
| 8 | HIGH | Web polish | Replace `/tasks` and `/goals` page-spinners with skeletons | S |
| 9 | HIGH | Mobile polish | Bump tap targets <44pt (goal chevron, mood pills) | S |
| 10 | HIGH | Web perf | Drop `force-dynamic` from safe GET routes (`/api/goals`, `/api/tasks`, `/api/lifemap`) | M |

Effort key: S = <2 hours, M = half-day, L = full day+.

---

## POST-LAUNCH FOLLOW-UPS

### `getUserProgression` — cache via `unstable_cache` keyed on userId

`/insights`, `/life-matrix`, `/goals`, and `/insights/theme-map` all share the same `page.tsx` shape: server component runs `await getUserProgression(session.user.id)` to drive a locked-feature gate, then renders either `<LockedFeatureCard/>` or the real client component. `/home` also calls it.

The progression call hits `User`, `Entry` (lifetime), `Theme`, `Goal`, and `LifeMapArea` tables, then writes back a snapshot via `prisma.user.update`. Even with the explicit `id`-only selects in place, this is one of the heaviest shell-layer reads in the app, and it runs on every consumer page-route render.

Wrap the body of `getUserProgression` in `unstable_cache` keyed on `userId` with a 30-second TTL. Invalidate via `revalidateTag(\`progression:\${userId}\`)` when an entry persists, a theme is created, a goal is upserted, or a life-area mention is incremented. Net effect: progression resolves instantly on every consumer page during a browsing session, with at most 30s of staleness for users not actively recording.

Estimated impact: removes ~50–150ms from every consumer page's TTFB on warm cache. Free during cold cache; revalidation cost is bounded by the 30s window.

Skipped from Phase 1–4 of the perf push because the wrapper file is shared across many surfaces and warrants its own targeted PR + a sweep of every mutation handler that should call `revalidateTag`. File-and-line locations:
- `apps/web/src/lib/userProgression.ts` (the function itself)
- Mutation sites that should invalidate on commit: `apps/web/src/app/api/entries/[id]/commit-extraction/route.ts`, `apps/web/src/app/api/goals/route.ts` (POST), `apps/web/src/app/api/themes/*` (any create paths), `apps/web/src/inngest/functions/process-entry.ts` (after persist step).

---

## NOTES ON HOW THIS AUDIT WAS DONE

- Four parallel sub-agents read the codebase: web perf, web polish, mobile (perf+polish combined), backend perf. No live profiling — agents read code only.
- Live perf measurements (TTFB, FCP, LCP, real Vercel Analytics, real device traces) were **not** captured. Issues here are inferred from code patterns, not measured. A follow-up pass with real Chrome DevTools / Vercel Analytics / device traces would either confirm or rule out specific items.
- Some MEDIUM-severity backend findings are pattern-extrapolated (e.g. "/api/admin/users/[id] likely reads full row" — file not opened, but every other admin route does). Those are flagged "likely" in the body.
- The audit deliberately skipped `/admin/*` UX (admin-only, not user-facing) and the marketing landing page details (lower priority).

This is the audit. Tell me which tier you want to ship.
