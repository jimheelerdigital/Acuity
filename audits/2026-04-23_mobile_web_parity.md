# Mobile vs Web Parity Audit — 2026-04-23

**Scope:** `apps/mobile` (Expo SDK 54 / React Native 0.81) vs `apps/web` (Next.js 14 App Router).
**Direction:** mobile → web. Goal is to identify every feature that exists on mobile but is missing, incomplete, or behaves meaningfully differently on web so web can reach parity before the Friday beta.
**Method:** file-level walk of both route trees + component directories, grep for API calls, direct read of ambiguous files. Audit-only — no code changes.

---

## Summary

- **Total mobile user-facing surfaces audited:** 24 routes + 23 components
- **Web at full parity:** 18 features
- **Web partial / different behavior:** 4 features
- **Web missing:** 3 features (one of them critical)
- **Mobile-only by design (should NOT come to web):** 6 behaviors
- **Web-only (opposite direction, out of audit scope but noted):** 8 features

### Critical gaps before beta

1. **`/entries/[id]` detail page does not exist on web.** Mobile has a full Entry detail screen (summary / themes / wins / blockers / tasks / transcript). Web's `/entries` list uses `EntryCard` components that don't link anywhere meaningful — a beta user who clicks a journal card gets nothing. Must-ship before beta. **Complexity: M, ~2-3 hr.**
2. **Web goal detail's "Record about this goal" button is broken.** It routes to `/home#record?goal=<encodeURIComponent(title)>` — the pre-Dashboard-rename legacy pattern. Doesn't open RecordSheet. Doesn't pass `goalId` through the proper flow. The resulting entry has no goal context. RecordSheet is already built for the dimension case; wiring goal context through it is ~20 minutes of work. **Complexity: S, ~30 min.**
3. **`/entries` list on web has no search and no mood filter.** Mobile journal tab has both. Web page is 115 LOC and is essentially a static list. For a beta with 20+ entries per active user, this is a hard UX regression vs. mobile. **Complexity: M, ~1-1.5 hr.**

### Parity recommendations — ordered

1. Build `/entries/[id]` detail page (critical).
2. Swap goal-detail Record CTA to RecordSheet with `context.type="goal"` (critical, trivial).
3. Add search + mood filter to `/entries` list (critical for beta UX).
4. (Nice-to-have) Wire `recommended-activity.tsx` goal CTA on both platforms to open RecordSheet with goal context instead of navigating to `/home`.
5. (Post-beta) Decide whether mobile should gain the web-only surfaces (crisis footer, data export UI, delete account UI, referrals UI) — out of scope for this audit, flagged separately.

---

## Parity Matrix

Rows are features. ✅ shipped, ⚠️ partial / behaves differently, ❌ missing, N/A = platform-specific by design.

| # | Feature | Mobile | Web | Complexity (if gap) | Notes |
|---|---|---|---|---|---|
| 1 | Home dashboard (greeting + record CTA + progression + recommended activity + recent entries) | ✅ | ✅ | — | Mobile `(tabs)/index.tsx`. Web `/app/home/page.tsx`. Both have ProgressionChecklist + RecommendedActivity + recent EntryCards + Record entry point. |
| 2 | Trial countdown / streak visible on Home | ✅ | ✅ | — | Mobile `TrialBanner`. Web `WelcomeBackBanner`. Similar content, different surface. |
| 3 | Tasks list sectioned by TaskGroup, collapsible | ✅ | ✅ | — | Mobile `(tabs)/tasks.tsx` + `GroupSection`. Web `/app/tasks/task-list.tsx:43-46`. Both shipped in the 2026-04-22 AI-grouped-tasks sprint. |
| 4 | Tap task title → open full editor | ✅ | ✅ | — | Mobile routes to `/task/[id]` modal screen. Web opens inline modal in `task-list.tsx`. Different UX paradigms, both meet the spec. |
| 5 | Task editor fields: title / description / priority / due date / group | ✅ | ✅ | — | Mobile `/app/task/[id].tsx`. Web inline modal. Both save via `/api/tasks` PATCH `action:"edit"` + `action:"move"`. |
| 6 | Long-press / hover task actions (snooze / complete / move / delete) | ⚠️ | ⚠️ | N/A | Mobile uses iOS `ActionSheetIOS`. Web uses hover dropdown + row-hover icon buttons. Platform-appropriate; different by design. |
| 7 | Goals hierarchy (tree with expandable children) | ✅ | ✅ | — | Both call `/api/goals/tree`. Web: `/app/goals/goal-list.tsx:96`. Mobile: `(tabs)/goals.tsx`. |
| 8 | Goal suggestions from entries (accept / dismiss / edit) | ✅ | ✅ | — | Mobile `SuggestionsSheet`. Web `/app/goals/suggestions-modal.tsx` (234 LOC). Both call `/api/goals/suggestions`. |
| 9 | Add sub-goal under parent | ✅ | ✅ | — | Mobile `AddSubgoalSheet`. Web `AddSubgoalModal`. Both call `POST /api/goals/:parentId/add-subgoal`. |
| 10 | Goal detail page (status / progress / notes / linked entries) | ✅ | ✅ | — | Mobile `/app/goal/[id].tsx`. Web `/app/goals/[id]/goal-detail.tsx:1-316`. Both have inline title edit, status pills, progress controls, notes, linked entries. |
| 11 | Goal detail: "Record about this goal" button | ✅ | ⚠️ | S | **GAP.** Mobile correctly routes to `/record?goalId=<id>` which passes through to `/api/record` as `goalId` FormData. Web's button at `/app/goals/[id]/goal-detail.tsx:265` still points to `/home#record?goal=<encodeURIComponent(title)>` (legacy). Doesn't open RecordSheet. No goalId reaches `/api/record`. |
| 12 | Entries list (chronological journal) | ✅ | ✅ | — | Mobile `(tabs)/entries.tsx`. Web `/app/entries/page.tsx`. Both exist. |
| 13 | Entries list — text search (case-insensitive across summary / themes / transcript) | ✅ | ❌ | M | **GAP.** Mobile has a search box that filters by summary + themes + transcript. Web's `/app/entries/page.tsx` (115 LOC) has no search UI. |
| 14 | Entries list — mood filter chips (ALL / GREAT / GOOD / NEUTRAL / LOW / ROUGH) | ✅ | ❌ | M | **GAP.** Mobile has mood chip row. Web does not. Part of the same work as #13. |
| 15 | Entry detail view (summary / themes / wins / blockers / tasks / transcript) | ✅ | ❌ | **M (critical)** | **GAP.** Mobile `/app/entry/[id].tsx`. Web has NO `/entries/[id]` route. Clicking an EntryCard on `/entries` or `/home` does nothing navigable. `GET /api/entries/[id]` endpoint exists (web already fetches it in the Theme Map redesign context) but is not consumed by any web page. |
| 16 | Insights hub (Life Matrix radar + recent activity + Theme Map link + Ask / State of Me / Weekly Reports) | ✅ | ✅ | — | Both shipped in the 2026-04-21 Insights redesign. |
| 17 | Life Matrix radar with Current / Trend toggle | ✅ | ✅ | — | Mobile `LifeMapRadar`. Web `/app/insights/life-map.tsx` with trend line chart via recharts. |
| 18 | Life Matrix dimension drill-down (score / trend / sparkline / themes / entries / goals / reflection prompt) | ✅ | ✅ | — | Mobile `/app/dimension/[key].tsx` modal. Web `DimensionDetailModal` on `/insights`. Both call `/api/lifemap/dimension/:key`. Shipped 2026-04-22. |
| 19 | "Record about this" from dimension reflection prompt | ✅ | ✅ | — | Mobile routes to `/record?dimensionKey=<key>`. Web opens `RecordSheet` with `context.type="dimension"`. Same end-to-end behavior. Shipped 2026-04-22 universal RecordSheet. |
| 20 | Recent Activity timeline strip on Insights | ✅ | ✅ | — | Mobile inline in `(tabs)/insights.tsx:346-410`. Web `/app/insights/recent-timeline.tsx`. |
| 21 | Theme Map redesign (constellation + sparkline cards + time chips + locked state) | ✅ | ✅ | — | Mobile `/app/insights/theme-map.tsx`. Web `/app/insights/theme-map/theme-map-client.tsx`. Both hit `/api/insights/theme-map?window=`. |
| 22 | Theme Map orbital entrance animation | ✅ | ✅ | — | Mobile Reanimated 3 (shipped 9155ed5). Web CSS keyframes (shipped 30bdf29). Both at full spec parity. |
| 23 | Weekly report generate + display (narrative + insights + mood arc + themes) | ✅ | ✅ | — | Both call `/api/weekly`. |
| 24 | Recording modal (permission → record → upload → processing → entry) | ✅ | ✅ | — | Mobile `/app/record.tsx` with state machine + polling. Web `record-button.tsx` + `record-sheet.tsx`. Both hit `POST /api/record` multipart. |
| 25 | Record with goalId context | ✅ | ⚠️ | S | Mobile `/record?goalId=<id>`. Web: **RecordSheet supports `context.type="goal"` but nothing currently calls it with a goal context**. The dimension case is wired (`dimension-detail.tsx`); the goal case has no caller. Companion to gap #11. |
| 26 | Record with dimensionKey context | ✅ | ✅ | — | Mobile `/record?dimensionKey=<key>`. Web `RecordSheet` with `context.type="dimension"`. Both persist `Entry.dimensionContext`. |
| 27 | Paywall (post-trial soft gate) | ✅ | ✅ | — | Mobile `/app/paywall.tsx` opens Safari to `/upgrade?src=mobile`. Web `/app/upgrade/page.tsx`. Both hit Stripe checkout. |
| 28 | Onboarding flow (multi-step, resumable) | ✅ | ✅ | — | Mobile 10 steps in `/app/onboarding.tsx`. Web 8 steps in `/app/onboarding/page.tsx`. Step count differs — mobile has separate mic-permission and practice-recording steps that web merges. Meaningful but intentional. |
| 29 | Theme preference (light / dark / system) | ✅ | ✅ | — | Mobile `(tabs)/profile.tsx:213` segmented control. Web `ThemeToggle` on `/account`. Both POST `/api/user/theme`. |
| 30 | Reminders settings (time + days + enabled toggle) | ⚠️ | ⚠️ | — | Mobile `/app/reminders.tsx` has dedicated screen with OS-level scheduling hook (awaiting expo-notifications native wiring). Web `/account` Reminders section has the fields wired to `/api/account/notifications` and sends via email. Different channels — email on web, push on mobile — both persist the same schedule; not a gap for beta. |
| 31 | Account / settings screen | ⚠️ | ✅ | N/A | Mobile `(tabs)/profile.tsx` has 5 rows (upgrade, appearance, reminders, apple health coming-soon, sign out). Web `/account` has 12 sections (profile, subscription, reminders, life dimensions, referrals, email prefs, integrations, data export, support & safety, appearance, privacy, delete account). **Web is already MORE comprehensive than mobile** — if anything the gap is mobile-side, which is out of scope for this audit. |
| 32 | Stripe customer portal access | ⚠️ | ✅ | N/A | Mobile "Manage plan on web" opens `/upgrade?src=mobile_profile` in SFSafari (IAP-compliance deliberate). Web `/account` has direct `/api/stripe/portal` button. |
| 33 | Data export | ❌ (mobile) | ✅ | N/A | Web-only; flagged for mobile roadmap post-beta. |
| 34 | Delete account | ❌ (mobile) | ✅ | N/A | Web-only; flagged for mobile roadmap post-beta. |
| 35 | Referrals | ❌ (mobile) | ✅ | N/A | Web-only; flagged for mobile roadmap post-beta. |
| 36 | Ask Your Past Self | ❌ (mobile links out) | ✅ | N/A | Web `/insights/ask`. Mobile links to the web URL. Not an audit gap — deliberate per prior sessions. |
| 37 | State of Me report list + detail | ❌ (mobile links out) | ✅ | N/A | Web `/insights/state-of-me`. Mobile links out. Not a gap — deliberate. |
| 38 | Life Audit display | ❌ (mobile) | ✅ | N/A | Web `/insights/life-audit/[id]`. No mobile equivalent yet. Post-beta. |
| 39 | Crisis footer (persistent 988 link) | ❌ (mobile) | ✅ | — | Web `components/crisis-footer.tsx` on all authenticated pages. Mobile does not render it. Not an audit gap — deliberate per 2026-04-21 pass ("passive resources only, no AI detection"). Could add to mobile post-beta if we decide. |
| 40 | `/support/crisis` page | ❌ (mobile) | ✅ | — | Web `/app/support/crisis/page.tsx`. Mobile has no equivalent. See #39. |
| 41 | Admin dashboard | ❌ (mobile) | ✅ | N/A | Web-only by design. 12 tabs (Overview / Growth / Engagement / Revenue / Funnel / Ads / AI Costs / Content Factory / Red Flags / Feature Flags / Users / Guide). Not a gap. |
| 42 | Feature flag UI / overrides | ❌ (mobile) | ✅ | N/A | Web admin. Not a gap. |
| 43 | Pull-to-refresh gesture | ✅ | N/A | N/A | Mobile uses `RefreshControl` on ScrollViews. Web equivalent is a click-to-refresh button or auto-revalidate. Platform-native. |
| 44 | Raised purple center-mic tab button | ✅ | N/A | N/A | Mobile tab bar design. Web has nav bar, different paradigm. |
| 45 | iOS `ActionSheetIOS` native menus | ✅ | N/A | N/A | Platform-native. Web uses hover dropdowns. |
| 46 | SFSafari in-app-browser upgrade handoff | ✅ | N/A | N/A | iOS-specific for IAP compliance. |
| 47 | OS-level push notifications for reminders | ⚠️ | ⚠️ | N/A | Mobile awaits expo-notifications native wiring. Web uses email. Different channels; same schedule columns. Both work, neither blocks beta. |
| 48 | Home tab foreground-refresh of auth on app resume | ✅ | N/A | N/A | Mobile AppState listener. Web doesn't need this — browser tab refocus doesn't invalidate session. |

---

## Screen-by-Screen Comparison

### Entry Detail (CRITICAL GAP)

- **Mobile route:** `apps/mobile/app/entry/[id].tsx`
- **Web route:** **MISSING.** No `apps/web/src/app/entries/[id]/page.tsx` exists.
- **Mobile features:**
  - Formatted date header (weekday + month + day)
  - Mood emoji + label
  - Energy score (if present)
  - Summary section (Claude-synthesized)
  - Themes chip row
  - Wins section (✓-prefixed bullets)
  - Blockers section (↳-prefixed bullets)
  - Tasks section (card per task with title + description + priority + status) — this is the page whose empty-cards bug was fixed in commit `31be41e`
  - Full transcript section (muted, read-only)
- **Web features:** None — `/entries` list's `EntryCard` components link nowhere.
- **Gap:** No drill-down. Critical for the core journaling loop on web. The backend (`GET /api/entries/[id]`) already returns the full projection with the 2026-04-23 fix, so it's a frontend-only ship.
- **Complexity:** M, 2-3 hr. Port the mobile layout — it's single-screen read-only, all data fields identical to mobile. Add a `<Link href="/entries/[id]">` wrapper around the EntryCard in both `/home` and `/entries` to send clicks to the new page.
- **Recommended approach:** Build `apps/web/src/app/entries/[id]/page.tsx` as a server component that fetches via Prisma (same pattern as the mobile API route). Lift the section layout directly from `apps/mobile/app/entry/[id].tsx` — it's simple stacked sections; no shared component to port.

### Entries List — Search + Mood Filter

- **Mobile route:** `apps/mobile/app/(tabs)/entries.tsx`
- **Web route:** `apps/web/src/app/entries/page.tsx` (exists, minimal)
- **Mobile features:**
  - Case-insensitive search input matching summary + themes (joined) + transcript
  - Mood filter chip row: ALL / GREAT / GOOD / NEUTRAL / LOW / ROUGH
  - Results re-rendered client-side from the full fetched list
- **Web features:**
  - Static chronological list, grouped by date header
  - No search, no filter
- **Gap:** Both UX affordances missing. Once a user has 30+ entries, web becomes unusable for finding anything.
- **Complexity:** M, 1-1.5 hr. Straightforward client-component rewrite of `/app/entries/page.tsx` — the data is already fetched server-side; convert to a client wrapper with local state for query + mood, render the same EntryCard components.
- **Recommended approach:** Pattern after mobile's implementation in `app/(tabs)/entries.tsx`. No shared component needed.

### Goal Detail — "Record about this goal"

- **Mobile route:** `apps/mobile/app/goal/[id].tsx` → tap reflection CTA → `/record?goalId=<id>`
- **Web route:** `apps/web/src/app/goals/[id]/goal-detail.tsx:265`
- **Mobile features:**
  - "Add a reflection" button routes to `/record?goalId=<id>`
  - Mobile `app/record.tsx:87` reads `useLocalSearchParams().goalId` and appends to `/api/record` FormData
  - Resulting entry persists with `Entry.goalId` set; Claude extraction anchors to the goal
- **Web features:**
  - Button at line 265 routes to `/home#record?goal=${encodeURIComponent(goal.title)}` — the legacy hash-fragment pattern from before the RecordSheet landed
  - Does NOT open RecordSheet
  - Does NOT pass `goalId` to `/api/record`
  - Entry is recorded with no goal context
- **Gap:** The RecordSheet component already supports `context.type="goal"` with `context.id=<goalId>` (see `apps/web/src/components/record-sheet.tsx:119-120`). Nothing is calling it with the goal context — the dimension-detail wiring is the only caller today.
- **Complexity:** S, 30 min. One-file change on `goal-detail.tsx` + import RecordSheet + state + open-on-click. Mirrors the pattern already in `insights/dimension-detail.tsx`.
- **Recommended approach:** Lift the `recordOpen` state + `<RecordSheet>` render from `apps/web/src/app/insights/dimension-detail.tsx:53-54,351-367` into `goal-detail.tsx`. Set `context={{type: "goal", id: goal.id, label: goal.title, description: goal.description ?? undefined}}`.

### Reminders

- **Mobile route:** `apps/mobile/app/reminders.tsx` (dedicated screen)
- **Web route:** `apps/web/src/app/account/account-client.tsx:77-82` (Reminders section within /account)
- **Mobile features:**
  - HH/MM stepper (custom, no native date picker)
  - 7 day-circle toggles
  - Master enabled toggle
  - Native permission prompt (iOS Settings link on denied)
  - OS-level scheduling hook (stubbed — awaits expo-notifications native wiring per app.json)
- **Web features:**
  - Time picker + day checkboxes + enabled toggle
  - Persists to `/api/account/notifications`
  - Delivery channel is email (not push)
- **Gap:** None functional — both persist the same fields. Channel difference (email vs push) is intentional per platform.
- **Complexity:** N/A.

### Recommended Activity Card (both Home pages)

- **Mobile component:** `apps/mobile/components/recommended-activity.tsx`
- **Web component:** `apps/web/src/components/recommended-activity.tsx`
- **Behavior:** Both render a 3-tier-logic recommendation card. Current CTA on both platforms navigates to `/goal/<id>` or `/home#record` — neither opens the RecordSheet.
- **Gap:** Same as #11 — when the recommended activity is goal-anchored, CTA should open the RecordSheet with goal context instead of routing away. Low priority since the current behavior works (goal detail page shows up), just less efficient.
- **Complexity:** S, 30 min per platform.

---

## API Surface Diff

**Endpoints mobile calls:**

```
GET    /api/home
GET    /api/entries
GET    /api/entries/:id
GET    /api/goals/tree
GET    /api/goals/:id
PATCH  /api/goals
DELETE /api/goals/:id
POST   /api/goals/:parentId/add-subgoal
GET    /api/goals/suggestions
POST   /api/goals/suggestions
GET    /api/tasks
GET    /api/task-groups
PATCH  /api/tasks
POST   /api/record
GET    /api/weekly
POST   /api/weekly
GET    /api/lifemap
GET    /api/lifemap/trend
GET    /api/lifemap/dimension/:key
POST   /api/lifemap/refresh
GET    /api/insights/theme-map
GET    /api/user/me
POST   /api/account/notifications
POST   /api/user/theme
POST   /api/auth/mobile-login
POST   /api/auth/mobile-magic-link
```

**Endpoints web calls (that mobile does not):**

```
GET    /api/lifemap/history
POST   /api/insights/ask-past                    # Ask Your Past Self, web-only UI
GET    /api/insights/observations                 # user-insights-card, wired on mobile only indirectly
GET    /api/insights/comparisons
GET    /api/insights/health-correlations
GET    /api/state-of-me
POST   /api/state-of-me
GET    /api/state-of-me/:id/share
GET    /api/life-audit
POST   /api/onboarding/update
POST   /api/onboarding/complete
POST   /api/account/life-dimensions               # custom dimension labels/colors, /account
POST   /api/account/email-preferences             # weekly/monthly email toggles
POST   /api/user/export                           # data export
POST   /api/user/delete                           # delete account
GET    /api/user/referrals                        # referrals
POST   /api/user/consent                          # GDPR cookie consent
POST   /api/task-groups
PATCH  /api/task-groups/:id
DELETE /api/task-groups/:id
POST   /api/task-groups/recategorize              # task groups settings page (not yet built on either)
POST   /api/goals
POST   /api/goals/:id/reparent                    # reparent goal — web-only drag feature
POST   /api/stripe/checkout
POST   /api/stripe/portal
POST   /api/integrations/calendar/connect         # 501 stub
GET    /api/health/snapshots                      # not yet consumed (Apple Health pending)
(+ all /api/admin/* — 22 routes — web-only admin)
```

**Endpoints mobile calls that web does not:**

```
POST   /api/auth/mobile-login
POST   /api/auth/mobile-magic-link
(handled by the web NextAuth flow server-side, not called client-side from web)
```

**Endpoints both call:**
All of the mobile list above except the mobile-auth bridges.

**Observation:** The endpoints web calls exclusively are all for features that are intentionally web-only (Ask Past Self, State of Me UI, Life Audit, admin, account-management surfaces). Nothing mobile calls is missing a server-side handler. The gap is entirely in web UIs that haven't been built, not in the API.

---

## Critical Path to Beta Parity (before Friday)

Ordered by impact. Total estimated effort: **~4 hours** if executed cleanly.

### 1. Build `/entries/[id]` detail page on web — **2-3 hr**
- Create `apps/web/src/app/entries/[id]/page.tsx` as a server component.
- Server-side fetch the entry via Prisma (same projection the mobile API uses — include tasks with title + description + priority + status + groupId per the 2026-04-23 fix).
- Render sections: header (date + mood + energy), summary, themes (chip row), wins (✓ bullets), blockers (↳ bullets), tasks (card per task with the existing row pattern from `task-list.tsx`), transcript (muted block at the bottom).
- Make `EntryCard` components on `/home` and `/entries` wrap with `<Link href="/entries/${entry.id}">`.
- 404 / redirect if entry not owned by current user (match the route's `getAnySessionUserId` pattern).

### 2. Swap web goal-detail Record button to RecordSheet — **30 min**
- `apps/web/src/app/goals/[id]/goal-detail.tsx:265` currently routes to `/home#record?goal=<title>`.
- Replace with `setRecordOpen(true)` + `<RecordSheet context={{type:"goal", id:goal.id, label:goal.title, description:goal.description}} open={recordOpen} onClose={...} onRecordComplete={refetchOrReload} />`.
- Mirror the exact pattern in `apps/web/src/app/insights/dimension-detail.tsx:53-54,351-367`.
- Entry will then persist with `goalId` set and the extractor will anchor correctly.

### 3. Add search + mood filter to `/entries` on web — **1-1.5 hr**
- Convert `apps/web/src/app/entries/page.tsx` to use a thin client-component wrapper that owns local state for `query: string` and `mood: Mood | "ALL"`.
- Filter the pre-fetched list client-side (same pattern as mobile's `filteredEntries` memo).
- Search matches: `summary + themes.join(" ") + transcript`, case-insensitive.
- Mood chips match mobile: ALL / GREAT / GOOD / NEUTRAL / LOW / ROUGH (use `MOOD_EMOJI` + `MOOD_LABELS` from `@acuity/shared`).

### Verification after shipping
- Click a journal card on web `/home` → lands on detail page with full transcript.
- Click a journal card on web `/entries` → same.
- On web goal detail, click "Record a short update on this goal" → RecordSheet opens in-place, record 20s, entry lands with `goalId` set, goal detail refreshes with the new linked entry.
- Type a query into `/entries` search on web → list filters. Tap a mood chip → list filters.

---

## Nice-to-have (post-beta)

| Feature | Platform gap | Est. effort |
|---|---|---|
| Wire `recommended-activity.tsx` goal CTAs to open RecordSheet instead of navigating | both | 30 min × 2 |
| Add mobile: crisis footer on authenticated screens | mobile | 1 hr |
| Add mobile: data export UI (calls existing `POST /api/user/export`) | mobile | 1.5 hr |
| Add mobile: delete account UI (calls existing `POST /api/user/delete`) | mobile | 1.5 hr |
| Add mobile: referrals card (calls existing `GET /api/user/referrals`) | mobile | 2 hr |
| Add mobile: Ask Your Past Self screen (calls existing `POST /api/insights/ask-past`) | mobile | 2-3 hr |
| Add mobile: State of Me list + reader (calls existing `/api/state-of-me*`) | mobile | 3-4 hr |
| Onboarding step count alignment (mobile 10 → web 8 or the reverse) | both | 1-2 hr depending on direction |
| `react-force-graph-2d` cleanup from web bundle (unused since theme-map redesign) | web | 15 min |
| Theme detail bottom-sheet wiring on both platforms (tap-hero / tap-planet / tap-card currently no-ops) | both | 2-3 hr |
| Task groups settings page (rename / icon / color / reorder / add / delete / "Re-run AI categorization") | both | 3-4 hr |
| Manual "Add task" button on task lists | both | 1 hr |

---

## Mobile features that should NOT come to web

These are platform-specific by design. Flagged for Jim to rubber-stamp; no action required unless we change course.

1. **Raised purple center-mic tab button** — mobile tab bar metaphor. Web has a horizontal nav bar; different interaction paradigm entirely. Web's record entry point is the RecordButton card on `/home`.
2. **iOS `ActionSheetIOS` native long-press menus** — iOS-native UX. Web uses hover dropdowns and row-hover icon buttons (shipped in `task-list.tsx`). Both work; neither is better.
3. **Pull-to-refresh gesture** — native mobile pattern. Web uses explicit refresh buttons or background revalidation.
4. **SFSafari in-app-browser handoff for `/upgrade`** — iOS pattern for App Store Review Guideline 3.1.1 compliance (separate payment surface). Web doesn't need it because Stripe checkout IS the web surface.
5. **AppState background→active listener refreshing auth** — mobile-only because JavaScript in iOS apps isn't always connected; web sessions are naturally live.
6. **OS-level push notifications** — mobile only has expo-notifications stubbed; web equivalent is email (already shipped) or Web Push (post-beta). Different channels; same persistence.

---

## Web-only features (opposite direction — out of audit scope, noted for completeness)

These are features that web has and mobile doesn't. The brief's direction is mobile → web, so these are not beta blockers. Listed so Jim has the full matrix when deciding what to schedule post-beta.

1. Admin dashboard (12 tabs) — `/admin`
2. Feature flag UI + per-user overrides — `/admin`
3. Crisis footer — `components/crisis-footer.tsx`
4. `/support/crisis` page — `app/support/crisis/page.tsx`
5. Data export — `/account`
6. Delete account — `/account`
7. Referrals UI — `/account`
8. Ask Your Past Self — `/insights/ask`
9. State of Me list + detail — `/insights/state-of-me/*`
10. Life Audit display — `/insights/life-audit/[id]`
11. Goal reparent (drag) — `POST /api/goals/:id/reparent`
12. Content Factory (admin content generation) — `/admin/content-factory`

---

## Confidence notes

- Mobile inventory: full file walk of `apps/mobile/app/` + `apps/mobile/components/`. 24 routes + 23 components enumerated with file:line references. High confidence.
- Web inventory: full file walk of `apps/web/src/app/` + `apps/web/src/components/`. 28 authenticated pages + 16 public + 68 API routes + 40+ components enumerated. High confidence.
- The three critical gaps (entries detail, goal-record, entries search) were verified by direct `grep` on the relevant files rather than left as inferences.
- Goal parity (suggestions + tree + reparent) was initially flagged as possibly a gap; direct read of `apps/web/src/app/goals/goal-list.tsx:86-237` confirmed the web version has full parity. Corrected to ✅.
- One feature is not fully testable without running the app end-to-end: whether `/home`'s recent-entries cards link to `/entries/[id]` or are inert. The file read showed no wrapping Link, so I've listed this as part of the entry-detail gap work — make the cards clickable when you build the detail page.
