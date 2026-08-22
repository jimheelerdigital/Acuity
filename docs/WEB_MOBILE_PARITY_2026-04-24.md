# Web ⇄ Mobile Parity + Web Expansion Audit

**Date:** 2026-04-24
**Scope:** Compare every user-facing feature between `apps/web` (Next.js 14) and `apps/mobile` (Expo SDK 54). Surface opportunities where the web app can go beyond mobile-parity to use its larger viewport, keyboard/mouse, longer sessions, and no-thumb constraints.

**Companion docs:**
- `docs/APP_STORE_LISTING.md`, `docs/APP_STORE_PRIVACY.md`, `docs/APP_STORE_PRICING.md` — App Store prep
- `docs/PERFORMANCE_AUDIT_2026-04-24.md` — mobile perf audit (reference pattern)
- `docs/Acuity_SalesCopy.md` — rubric for any user-facing copy this audit implies should change

**Intent:** Reference. No code changes. A separate run executes fixes from §4.

**Method:** File-by-file inventory of both apps' signed-in routes; cross-reference component-level drift; grep for desktop-capability markers (`onKeyDown`, `xl:`, drag-drop libraries, print, export); verify agent-reported claims against source.

---

## §1 Executive summary

### 1.1 Top 10 parity drifts (ranked by user-visible impact)

| # | Drift | Severity | Where |
|---|---|---|---|
| 1 | **Mobile has haptic on task complete; web has no equivalent affordance.** On mobile, checking a task fires a light haptic (ImpactFeedbackStyle.Light, iOS only). Web has no corresponding micro-feedback — just the visual state change. | Medium | `apps/mobile/app/(tabs)/tasks.tsx:189–196` vs `apps/web/src/app/tasks/task-list.tsx` |
| 2 | **Mobile has a sticky BackButton on every detail screen; web's StickyBackButton is exported but only used on `/insights/theme-map`.** On long detail pages (Goal Detail, Entry Detail, Theme Detail) the user has to scroll back to the top to navigate away. | Medium | `apps/web/src/components/back-button.tsx:47–66` (exported, unused on entry/goal/theme detail) |
| 3 | **Web Goals page has no top-level title section.** Mobile's Goals tab opens with a 36pt "Goals" title + "N in progress" subtitle. Web just drops into the tree with no heading. Makes the page feel like a component, not a product surface. | Medium | `apps/web/src/app/goals/page.tsx` vs `apps/mobile/app/(tabs)/goals.tsx:396–410` |
| 4 | **Mobile's "stays-visible-until-blur" checkbox behavior not mirrored on web.** On mobile, tapping a task checkbox keeps the item on the Open list until you leave the tab (shipped 2026-04-23). Web's Tasks page re-sorts immediately on state change. Different rhythm between apps. | Medium | `apps/mobile/app/(tabs)/tasks.tsx:129–154` (visit snapshot) vs `apps/web/src/app/tasks/task-list.tsx:110–120` |
| 5 | **Mobile has a dedicated Task Editor modal (`/task/[id]`); web edits inline in the list.** Web can't do title + description + priority + due date + group at once — must use inline triggers. Not broken, just less capable. | Low | `apps/mobile/app/task/[id].tsx` vs `apps/web/src/app/tasks/task-list.tsx` |
| 6 | **Primary heading typography drift.** Mobile uses `text-4xl` (36pt bold) for tab headers (Home, Tasks, Goals, Entries, Insights). Web's equivalent pages use `text-3xl` (30pt) or smaller. Side-by-side the apps feel slightly different. | Low | Mobile tab files (each has `text-4xl font-bold`) vs `apps/web/src/app/home/page.tsx` + `/entries/page.tsx` etc. |
| 7 | **Life Matrix dimension drill-down is a dedicated full-screen modal on mobile; on web it's a floating modal overlay.** Not a clear win either way, but the interaction rhythms diverge: mobile you navigate + back-button; web you dismiss the overlay. | Low | `apps/mobile/app/dimension/[key].tsx` vs `apps/web/src/app/insights/life-map.tsx` (DimensionDetailModal inline) |
| 8 | **Mobile has push-notification reminders UI (`/reminders`); web has reminder-time fields inline in `/account`.** Not strictly a parity gap — reminders on web are browser-push-based, which is a different capability — but users have to look in different places. | Low | `apps/mobile/app/reminders.tsx` vs `apps/web/src/app/account/account-client.tsx` |
| 9 | **Mobile performance cache (`lib/cache.ts`) has no web equivalent.** The 30s SWR cache + synchronous hydrate that made mobile tab switches instant is absent on web. Every web page navigation re-fetches. On a desktop session that may be dozens of navigations an hour. | Low | `apps/mobile/lib/cache.ts` — no web counterpart (Next.js App Router caching is route-level, not app-level SWR) |
| 10 | **Mobile has recorded verification that Fabric/Hermes are on; web has no equivalent "framework health" checklist.** Not user-visible today, but future mobile changes that depend on Fabric could ship in isolation without the web side knowing. | Low | `ios/Podfile.properties.json` (mobile); no web counterpart needed but worth documenting |

### 1.2 Top 10 web-expansion opportunities (ranked by effort-to-value ratio)

| # | Opportunity | Effort | Impact |
|---|---|---|---|
| 1 | **Apply StickyBackButton to every web detail page.** Already exported, already used on Theme Map. Propagating to Entry Detail, Goal Detail, Theme Detail, Life Audit Detail, State of Me Detail is ~10min per page. | S (<2h total) | Parity fix + desktop ergonomic win |
| 2 | **Add `xl:` / `2xl:` breakpoints to main signed-in pages.** Every page caps at `max-w-3xl` (768px). On a 1440px monitor, ~50% of the viewport is blank. Adding `xl:max-w-5xl` / `2xl:max-w-6xl` lets content breathe. | S | Immediate visual upgrade on desktop |
| 3 | **Add Goals page title header on web.** Mirror the mobile pattern: "Goals" at text-4xl + "N in progress" subtitle. | S | Makes the page feel like a destination |
| 4 | **Command palette (Cmd+K).** The `/` focus-search shortcut exists. A proper cmdk palette that fuzzy-searches entries / goals / tasks / themes, plus quick actions ("Record", "Go to Goals", "New entry"), is ~1 day of work. Power users would live in it. | M | Highest desktop-native win |
| 5 | **Two-pane layout on `/entries`.** Today `/entries` is a list → click → full-page navigate. A desktop split-pane (list left 400px, selected entry right) would let a user read through a week's entries without a page load each time. Keep single-pane on narrow viewports. | M | Fits "artifact-driven" narrative; reading entries is a desktop activity |
| 6 | **PDF export on Weekly Report, Life Audit, State of Me.** These are the hero artifacts. Users will want to save them, share them, print them out. Today the only path is browser print-to-PDF. Real PDF generation via Puppeteer + a styled template is a one-time cost. | M | Artifact-completeness win; matches "show the artifact" rubric §1.3 |
| 7 | **Hover preview on entry cards.** On `/entries`, hovering an entry card shows a popover with summary + top 2 themes + mood without navigating. Reduces navigation friction for triage-style browsing. | S | Cheap desktop ergonomic win |
| 8 | **Life Matrix radar: larger canvas + historical-overlay mode on desktop.** Mobile-first grid (`grid-cols-3` max) renders at the same size regardless of viewport. On a 1440px monitor we could show a 600pt radar with 4-week-ago overlay, an 8-week trend, dimension-level sparklines. | M | Unique to desktop; aligns with "memory is the product" positioning |
| 9 | **Drag-to-reparent goals (API is ready).** The comment at `goal-list.tsx:29` explicitly flags this as v2 UI work; the `PATCH /api/goals/[id]/reparent` endpoint already exists. Adding dnd-kit is ~half a day. | M | Power-user win for tree reorganization |
| 10 | **Recording: global shortcut (Cmd+R / Cmd+Space or `n` with modifier).** Today `n` jumps to `/home#record`. A true "anywhere, press shortcut, immediately record" flow — including a small floating recording widget that doesn't require leaving the current page — is a web-native move mobile can't do. | M | Matches "nightly ritual" positioning; turns web into a keystroke-native tool |

---

## §2 Parity audit matrix

**Legend:**
- **Mobile** / **Web**: ✓ = implemented / ⚠ = partial / ✗ = missing / 💀 = broken
- **Parity**: = matched / ≠ drifted / M-only = mobile-only / W-only = web-only
- **Sev**: H/M/L

### 2.1 Navigation & shell

| Feature | Mobile | Web | Parity | Notes | Sev |
|---|---|---|---|---|---|
| Bottom tab bar (5 slots) | ✓ | ✗ | M-only | Web uses top nav / page routing instead. Intentional — different platform idioms. | N/A |
| Top nav bar | ✗ | ⚠ | W-only | Web lacks a persistent top nav; users rely on direct URL entry or page-local nav | M |
| Raised center record button | ✓ | ✗ | M-only | Web equivalent: record button on `/home`. Intentional | N/A |
| BackButton style | ✓ circle sticky | ⚠ circle inline | ≠ | Web `StickyBackButton` exported but only wired on Theme Map | M |
| Safe-area handling | ✓ | N/A | N/A | Mobile-only concept | N/A |
| Keyboard shortcuts | ✗ | ⚠ basic | ≠ | Web has `n`/`g`/`i`/`e`/`/`; no Cmd+K, no arrow-key list nav, no Cmd+N for record | N/A (not a parity issue — desktop-only) |
| Tab label alignment | ✓ (verified 2026-04-24) | N/A | N/A | — | N/A |

### 2.2 Core flows

| Feature | Mobile | Web | Parity | Notes | Sev |
|---|---|---|---|---|---|
| Onboarding 10-step flow | ✓ | ✓ | = | Both use `@acuity/shared` progression model; copy parity confirmed | — |
| Sign-in (Google OAuth) | ✓ | ✓ | = | — | — |
| Sign-in (email + password) | ✗ | ✓ | W-only | Mobile is magic-link-only by design (no password field) | L |
| Password reset flow | ✗ | ✓ | W-only | Consequence of above — intentional | — |
| Magic-link cross-device handoff | ✓ | ✓ | = | `/auth/mobile-complete` on web + `acuity://auth-callback` scheme on mobile | — |
| Recording (trigger + UI) | ✓ native Audio.Recording | ✓ MediaRecorder API | = | Web has FULL recording UI at `/home/record-button.tsx`; feature parity confirmed | — |
| Recording haptic (iOS) | ✓ | ✗ | M-only | Intentional — web browsers don't have haptic | — |
| Recording upload + polling | ✓ | ✓ | = | Both use `useEntryPolling` style pattern | — |
| Extraction review (confirm tasks/goals/themes) | ✓ | ✓ | = | `ExtractionReview` component on both; placement differs slightly (mobile: top of entry detail; web: right after header) | L |
| Entry detail layout | ✓ | ✓ | = | Both render: date header, mood + energy, summary, themes, wins, blockers, linked tasks, transcript | — |

### 2.3 Tabs / main screens

| Feature | Mobile | Web | Parity | Notes | Sev |
|---|---|---|---|---|---|
| Home greeting + session count | ✓ | ✓ | = | Both show "Good {morning,afternoon,evening}, {firstName}" + week count | — |
| Home streak (🔥 Flame icon) | ✓ | ✓ | = | — | — |
| Home focus card stack (unlock + milestone + resting) | ✓ Reanimated | ✓ CSS transforms | = (feel may diverge) | Flagged to QA both for motion parity | L |
| Home recent-sessions list | ✓ 5 items | ✓ 5 items | = | — | — |
| Home "Record your brain dump" primary CTA | ✓ | ✓ | = | — | — |
| Home trial banner (last 7 days) | ✓ | ✓ | = | — | — |
| Tasks — Open/Snoozed/Done tabs | ✓ | ✓ | = | Verified: `apps/web/src/app/tasks/task-list.tsx:32` has the same 3-Tab type | — |
| Tasks — group sections with icons | ✓ | ✓ | = | — | — |
| Tasks — inline checkbox | ✓ | ✓ | = | — | — |
| Tasks — stays-visible-until-blur on check | ✓ | ✗ | M-only | Shipped mobile 2026-04-23; web re-sorts immediately | M |
| Tasks — haptic on complete (iOS) | ✓ | ✗ | M-only | Platform diff — but web could micro-animate (scale + fade) to compensate | L |
| Tasks — Task Editor modal (full edit) | ✓ `/task/[id]` | ⚠ inline | ≠ | Web edits are per-field inline; can't do title + description + priority + due + group at once | L |
| Goals — grouped tree (Career, Health, etc.) | ✓ | ✓ | = | `GOAL_GROUPS` from `@acuity/shared` powers both | — |
| Goals — page title header | ✓ | ✗ | ≠ | Web drops straight into tree with no heading | M |
| Goals — sub-goal add via `+` | ✓ | ✓ | = | Both open a sheet/modal | — |
| Goals — inline task-leaf checkboxes | ✓ | ✓ | = | Both render tasks beneath their parent goal | — |
| Goals — status pills + life-area color pills | ✓ | ✓ | = | — | — |
| Goals — drag-to-reparent | ✗ | ✗ | N/A (future) | API ready (PATCH /api/goals/[id]/reparent); UI not built either side | — |
| Goals — archived toggle | ✓ | ✓ | = | — | — |
| Entries — full chronological list | ✓ FlatList | ✓ page | = | — | — |
| Entries — search + mood filter | ✓ | ✓ | = | Both client-filtered over an entry list capped at ~100 | — |
| Entries — tap an entry → detail | ✓ modal-push | ✓ full page | = | — | — |
| Insights — Life Matrix | ✓ radar (`LifeMapRadar`) | ✓ hex grid (`LifeMap`) | ≠ | Different visual forms for the same data. Mobile: radar chart. Web: hexagon scatter. Mild inconsistency. | L |
| Insights — Life Matrix → dimension drill-down | ✓ `/dimension/[key]` full screen | ✓ `DimensionDetailModal` overlay | ≠ | — | L |
| Insights — Theme Map entry card | ✓ | ✓ | = | — | — |
| Insights — State of Me tile (locked / unlocked) | ✓ | ✓ | = | — | — |
| Insights — Ask Your Past Self tile | ✓ placeholder (coming soon) | ✓ live | ≠ | Mobile shows "Coming soon to mobile" — intentional; web has the live AskPastClient | M |
| Insights — Recent Activity timeline | ✓ horizontal scroll | ✓ `RecentTimeline` | = | — | — |
| Insights — Compared-to-Before / user insights | ✓ `UserInsightsCard` + `ComparisonsCard` | ✓ same components | = | — | — |
| Insights — Generate Weekly Report button | ✓ | ✓ | = | Both fire `/api/weekly` | — |
| Insights — Metrics drawer | ✓ collapsible | ✓ `MetricsDrawer` | = | — | — |

### 2.4 Theme Map + Theme Detail

| Feature | Mobile | Web | Parity | Notes | Sev |
|---|---|---|---|---|---|
| Theme Map — constellation viz (Round 4) | ✓ Reanimated orbs, SVG gradients | ✓ CSS @keyframes, CSS gradients | = | Same rank-band layout (hero / inner / middle / outer). Motion implementation different but visually aligned. | L |
| Theme Map — narrative sentence | ✓ | ✓ | = | Same `buildNarrative` logic ported to both | — |
| Theme Map — orb breathing animation | ✓ Reanimated `withRepeat` | ✓ CSS `@keyframes breathe-slow` | = | — | — |
| Theme Map — strip list (rank 16+) | ✓ | ✓ | = | — | — |
| Theme Map — time window selector | ✓ 5 chips | ✓ 5 chips | = | — | — |
| Theme Map — sentiment legend | ✓ | ✓ | = | — | — |
| Theme Map — sticky back button | ✓ | ✓ | = | Web applied after Round 4 | — |
| Theme Detail — trend area chart | ✓ Fritsch-Carlson cubic, SVG | ✓ same | = | — | — |
| Theme Detail — "What Acuity notices" AI card | ✓ | ✓ | = | — | — |
| Theme Detail — mentions list | ✓ `MentionCard[]` | ✓ same | = | — | — |
| Theme Detail — related chips | ✓ `RelatedChips` | ✓ same | = | — | — |
| Theme Detail — sticky back button | ✓ | ✗ | ≠ | Web still uses inline BackButton | M |

### 2.5 Reports

| Feature | Mobile | Web | Parity | Notes | Sev |
|---|---|---|---|---|---|
| Weekly Report | ✓ rendered inside Insights tab | ✓ `/shared/weekly/[id]` for public + inline on Insights | ≠ | Web has a dedicated public share page (`/shared/weekly/[id]`) with expiry enforcement; mobile has no share-link flow | M |
| Life Audit (Day 14) | ✓ rendered inline | ✓ `/insights/life-audit/[id]` dedicated page | ≠ | Web has a more ambitious editorial layout (warm bg #FAFAF7, prose typography, themes-arc 3-column grid); mobile renders it within Insights section | L |
| State of Me (quarterly) | ⚠ placeholder ("Coming soon") | ✓ full list + detail + share | ≠ | Intentional — mobile flagged as deferred | — |
| Public share link (weekly) | ✗ | ✓ `/shared/weekly/[id]` | W-only | Expiry enforcement + noindex/nofollow already wired on web | — |
| Public share link (state of me) | ✗ | ✓ `/shared/state-of-me/[id]` | W-only | Same | — |

### 2.6 Account + subscription

| Feature | Mobile | Web | Parity | Notes | Sev |
|---|---|---|---|---|---|
| Profile tab / Account page | ✓ Profile tab (`/(tabs)/profile`) | ✓ `/account` | = | — | — |
| Email display (read-only) | ✓ | ✓ | = | — | — |
| Name edit | ✓ | ✓ | = | — | — |
| Notification time + day selector | ✓ `/reminders` dedicated page | ✓ inline in `/account` | ≠ | Location differs; functionality aligned | L |
| Theme preference (light/dark/system) | ✓ | ✓ | = | — | — |
| Subscription status display | ✓ | ✓ | = | — | — |
| Subscription checkout | ✗ (redirects to web) | ✓ `/upgrade` via Stripe | Intentional M→W redirect | Per App Store 3.1.3(b) Multiplatform Services rule | — |
| Stripe billing portal link | ✓ (redirects to web) | ✓ | = | — | — |
| Data export (zip) | ✗ | ✓ `/account` | W-only | Rate-limited 1 per 7 days; mobile users should see a "manage on web" affordance (unclear if present) | M |
| Account deletion | ✓ | ✓ | = | — | — |

### 2.7 Visual system

| Feature | Mobile | Web | Parity | Notes | Sev |
|---|---|---|---|---|---|
| Color palette (tokens) | ✓ | ✓ | = | `#7C3AED` purple, `#0B0B12` dark bg, emerald/indigo/rose sentiment — confirmed matched | — |
| Icons (Lucide) | ✓ `lucide-react-native` | ✓ `lucide-react` | = | Same icon set, no emoji in product UI | — |
| Typography (primary headings) | `text-4xl` | `text-3xl` | ≠ | 1 step difference | L |
| Typography (secondary text) | ✓ consistent | ✓ consistent | = | — | — |
| Spacing rhythm | inline px values | Tailwind scale | ≠ | Internally consistent on each side; no shared design token doc | L |
| Dark mode (default) | ✓ | ✓ | = | Both dark-first | — |
| Mount animations | Reanimated | CSS @keyframes | ≠ | Intentional platform split | L |
| Hover states | N/A | ⚠ decorative only | W underused | Opportunity: hover = preview (§3) | M (expansion) |

### 2.8 Performance

| Feature | Mobile | Web | Parity | Notes | Sev |
|---|---|---|---|---|---|
| Module-level cache + SWR | ✓ `lib/cache.ts` | ✗ | M-only | Next.js App Router caching is not equivalent (route-level only, not per-user SWR in the client) | L |
| Optimistic mutations | ✓ Tasks + Goals | ⚠ partial | ≠ | Web's Tasks + Goals may still `await refetch` after mutations; spot check recommended | M |
| Loading states | ✓ cached + stale-while-revalidate | ⚠ Next.js default loading.tsx / Suspense | ≠ | Web may show more spinner flashes than mobile after recent perf work | L |
| Bundle size | Hermes + transform-remove-console | Webpack (App Router) | N/A | Different stacks | — |

### 2.9 System concerns

| Feature | Mobile | Web | Parity | Notes | Sev |
|---|---|---|---|---|---|
| Sentry error tracking | ✓ | ✓ | = | Both initialized at root layout | — |
| Sentry PII scrub | ✓ `scrubDeep` | ⚠ — verify | ≠ | Mobile has confirmed `beforeSend` hook; web's sentry config should be audited for equivalent scrubber | M |
| Analytics (PostHog) | ✓ `safeLog` sanitizer | ✓ same patterns | = | — | — |
| Deep linking | ✓ `acuity://` scheme | ✓ `getacuity.io` as receiver | = | — | — |
| Subscription enforcement (gated endpoints) | ✓ 402 handling | ✓ `entitlements.ts` | = | Shared helper | — |

### 2.10 Web-only routes (no mobile equivalent; most intentional)

- `/` (marketing landing) — correct; mobile is sign-in-first
- `/blog/*` — marketing content
- `/for/{founders,therapy,sleep,decoded,weekly-report}` — Meta-ad landing pages
- `/waitlist`, `/voice-journaling` — marketing/SEO
- `/upgrade` — subscription checkout (correct per 3.1.3(b))
- `/privacy`, `/terms`, `/support`, `/support/crisis` — legal/support
- `/admin/*` — admin dashboard (correct — web-only)
- `/shared/weekly/[id]`, `/shared/state-of-me/[id]` — public share pages

### 2.11 Mobile-only routes (no web equivalent; flag for review)

- `/record.tsx` — full-screen recording modal (web has inline `RecordButton` at `/home`; parity OK)
- `/paywall.tsx` — in-app paywall interstitial with "Continue on web" CTA (correct)
- `/reminders.tsx` — notification scheduler (web has this inline in `/account` — consider adding a dedicated web `/account/reminders` page for consistency)
- `/dimension/[key].tsx` — Life Matrix drill-down (web has modal overlay; different pattern)
- `/task/[id].tsx` — task editor modal (web lacks this — see §2.3 drift #5)

---

## §3 Web expansion opportunities

Organized by screen. Every opportunity tagged:
- **v1 ship-blocker** — needed for launch parity
- **post-v1 polish** — ships after App Store approval
- **future consideration** — v2+

### 3.1 Navigation / shell

#### 3.1.1 Sticky BackButton propagation
- **Current:** `StickyBackButton` exported at `apps/web/src/components/back-button.tsx:47–66`; used only on `/insights/theme-map/theme-map-client.tsx`.
- **Opportunity:** Apply to `/entries/[id]`, `/goals/[id]`, `/insights/theme/[themeId]`, `/insights/state-of-me/[id]`, `/insights/life-audit/[id]`, `/account`.
- **Effort:** S (~10min per page, ~1h total).
- **Rationale:** Already mobile-parity work. Shipped mobile today; web is one line of import change per page.
- **Tag:** post-v1 polish.

#### 3.1.2 Command palette (Cmd+K)
- **Current:** `apps/web/src/components/keyboard-shortcuts.tsx` has `n`/`g`/`i`/`e`/`/`. No command palette.
- **Opportunity:** Install `cmdk` (https://cmdk.paco.me). Fuzzy-search over entries/goals/tasks/themes; quick actions (Record, Go to X, Generate Weekly Report). Keyboard-driven.
- **Effort:** M (1 day).
- **Rationale:** Highest desktop-native win. Power users live in command palettes.
- **Tag:** post-v1 polish.

#### 3.1.3 Top nav bar (persistent)
- **Current:** Web has no persistent top nav. Users rely on direct URL, page-local links, or keyboard shortcuts.
- **Opportunity:** Slim top bar with logo, Home / Goals / Tasks / Entries / Insights links, avatar menu. Typographic, not chunky.
- **Effort:** M (1–2 days including responsive behavior).
- **Rationale:** Matches "this is a product, not a marketing site" feel once logged in.
- **Tag:** post-v1 polish.

### 3.2 Home

#### 3.2.1 Widen to desktop viewport
- **Current:** `/home/page.tsx` uses `max-w-5xl` with `lg:grid-cols-3`. 5xl = 1024px. On 1440px+ monitors, ~30% empty.
- **Opportunity:** `xl:max-w-6xl` (1152px), `2xl:max-w-7xl` (1280px). Consider `xl:grid-cols-4` for home to fit a 4th column (e.g. recent themes preview, weekly report snippet).
- **Effort:** S (<2h).
- **Tag:** post-v1 polish.

#### 3.2.2 Home "recent artifacts" lane
- **Current:** Recent sessions list only.
- **Opportunity:** Add a horizontal "recent artifacts" row below the record button — thumbnails of the last 2 Weekly Reports + Life Audit if present. Click → open the artifact. Makes the dashboard feel like a library, not just an input.
- **Effort:** M.
- **Rationale:** Rubric §7.2 says "the hero conversion driver is the weekly report." The dashboard should surface artifacts prominently.
- **Tag:** post-v1 polish.

### 3.3 Tasks

#### 3.3.1 Mirror the "stays-visible-on-check" rhythm
- **Current:** Web tasks re-sort immediately after a check.
- **Opportunity:** Port the visit-snapshot logic from `apps/mobile/app/(tabs)/tasks.tsx:46–77` to web. Frozen tab membership for the current visit; re-categorize on focus change.
- **Effort:** S.
- **Rationale:** User rhythm parity. Jim's intention was that the behavior should feel consistent across apps.
- **Tag:** v1 ship-blocker (behavior drift from mobile is user-visible).

#### 3.3.2 Web equivalent of mobile haptic (visual micro-feedback)
- **Current:** Check fires instant state change.
- **Opportunity:** Scale-down-then-up animation (0.9 → 1.05 → 1.0 over 240ms) on check. Subtle "confirmation" micro-feedback that replaces the haptic web can't do.
- **Effort:** S.
- **Tag:** post-v1 polish.

#### 3.3.3 Task editor modal on web (parity with mobile)
- **Current:** Web edits title/priority/due/etc. inline across different UI surfaces.
- **Opportunity:** Click task title → modal with all fields at once (matches mobile `/task/[id]`).
- **Effort:** M.
- **Tag:** post-v1 polish.

#### 3.3.4 Bulk actions + multi-select (desktop-native)
- **Current:** None.
- **Opportunity:** Shift+click to range-select, Cmd+A for all, bulk "mark complete / snooze / move to group / archive". Checkboxes already exist per-row; add a selection state + action bar that slides in when ≥1 is selected.
- **Effort:** M.
- **Tag:** post-v1 polish.

#### 3.3.5 Keyboard shortcuts on Tasks
- **Current:** None.
- **Opportunity:** j/k to navigate rows, Space to toggle check, e to edit, s to snooze, d to delete. Inspired by Gmail/Linear.
- **Effort:** S.
- **Tag:** future consideration.

### 3.4 Goals

#### 3.4.1 Page title header
- **Current:** No title; `/goals` drops straight into the tree.
- **Opportunity:** 36pt "Goals" + "N in progress" subtitle, matching mobile.
- **Effort:** S.
- **Tag:** v1 ship-blocker (visual parity gap is immediately noticeable).

#### 3.4.2 Drag-to-reparent
- **Current:** API ready, UI scoped out per `goal-list.tsx:29`.
- **Opportunity:** `dnd-kit/core` + `dnd-kit/sortable` to support drag-to-different-parent. Visual feedback: drop zone highlights, indent preview.
- **Effort:** M.
- **Rationale:** Restructuring goals is a desk-top / think-mode activity.
- **Tag:** post-v1 polish.

#### 3.4.3 Goal detail two-pane layout
- **Current:** Click goal → full-page navigate to `/goals/[id]`.
- **Opportunity:** Desktop (lg+): tree left, detail right. Click goal in tree → right pane updates without page load. Preserve mobile full-page navigation on small screens.
- **Effort:** L.
- **Tag:** future consideration.

### 3.5 Entries

#### 3.5.1 Two-pane layout (list + detail)
- **Current:** List → click → navigate to `/entries/[id]`.
- **Opportunity:** `xl:` breakpoint splits to 400px list + flexible detail pane. Selected entry loads in-place. URL updates via `router.replace` so back button / share-link still work.
- **Effort:** L.
- **Rationale:** Reviewing a week of entries desktop-side is a core "shutdown ritual" behavior. Making it cheap to flip through encourages the practice.
- **Tag:** post-v1 polish.

#### 3.5.2 Calendar / heatmap view
- **Current:** Chronological list only.
- **Opportunity:** Optional grid view — month at a glance, cells colored by mood intensity, click a cell → open the entry. Toggle between "list" and "calendar".
- **Effort:** L.
- **Tag:** future consideration.

#### 3.5.3 Hover preview on entry cards
- **Current:** Hover = shadow shift.
- **Opportunity:** On hover, show a popover: summary + top 2 themes + mood. Dismisses on mouse-leave. No click required.
- **Effort:** S.
- **Tag:** post-v1 polish.

#### 3.5.4 Export selection → CSV / Markdown
- **Current:** `/api/user/export` exists and produces a full zip. No per-entry or per-range export.
- **Opportunity:** Multi-select entries + "Export as Markdown" / "Export as CSV" action. Server-side compose and stream back.
- **Effort:** M.
- **Tag:** future consideration.

### 3.6 Insights

#### 3.6.1 Life Matrix — larger desktop canvas
- **Current:** `grid-cols-2 sm:grid-cols-3` max. Same render regardless of viewport.
- **Opportunity:** `xl:` → larger radar + historical overlay (4 weeks ago dashed). Hover a dimension → sparkline of its 12-week trajectory in a floating tooltip. Click → dimension detail as before.
- **Effort:** M.
- **Rationale:** Rubric §7.3: "Memory is the product." Showing history is the sell.
- **Tag:** post-v1 polish.

#### 3.6.2 Compared-to-Before: sparklines + multi-period
- **Current:** Text row with arrow.
- **Opportunity:** Inline sparkline next to each stat. Toggle: "vs last week" / "vs last month" / "vs last quarter". Hover the sparkline → data-tip per point.
- **Effort:** M.
- **Tag:** post-v1 polish.

### 3.7 Theme Map / Theme Detail

#### 3.7.1 Full-canvas constellation on desktop
- **Current:** Constellation is `min(screenWidth - 40, 420)px` wide on both mobile and web. On 1440px, 420px constellation feels tiny.
- **Opportunity:** Desktop (xl+): constellation scales to ~720–840px. More orbital real estate means labels could sit at their own polar angle rotation (not just above/below), and inner-ring orbs could grow to ~100pt each. Narrative sentence becomes a dedicated sidebar with examples.
- **Effort:** M.
- **Rationale:** The viz is the hero. Scale it.
- **Tag:** post-v1 polish.

#### 3.7.2 Theme Detail side panel
- **Current:** Click orb → navigate to `/insights/theme/[themeId]`.
- **Opportunity:** Two-pane: constellation left, detail panel slides in from right on orb click. Right panel: area chart, mentions, related chips. Navigate between themes without leaving the map.
- **Effort:** L.
- **Tag:** future consideration.

#### 3.7.3 Hover preview on orbs
- **Current:** Hover = scale + glow.
- **Opportunity:** Hover orb → floating preview: last 2 mentions, sentiment trend over last 4 weeks. 300ms delay to avoid flicker.
- **Effort:** S.
- **Tag:** post-v1 polish.

### 3.8 Reports (Weekly Report, Life Audit, State of Me)

#### 3.8.1 Magazine-layout treatment
- **Current:** Single-column `max-w-3xl` (768px) prose. Mobile-feel.
- **Opportunity:** Desktop (lg+): two-column layout. Left: narrative + prose. Right: sidebar with mood arc chart, top themes pills, entry count stats, TOC for long reports. Pull-quotes inline in the narrative at key insight moments.
- **Effort:** L.
- **Rationale:** Rubric §1.3: "Show the artifact." Magazine layouts make the artifacts feel like artifacts.
- **Tag:** post-v1 polish.

#### 3.8.2 PDF / print export
- **Current:** Only browser Print → Save as PDF.
- **Opportunity:** Server-side Puppeteer job renders the report at a styled print template and returns a PDF. Share button: "Download PDF" alongside existing "Copy share link."
- **Effort:** L (Puppeteer + template styling + Inngest async job).
- **Rationale:** Users will want to save and share these. Rosebud has PDF export; Day One has it; Mindsera charges more for it.
- **Tag:** post-v1 polish.

#### 3.8.3 Next/previous report navigation
- **Current:** On a weekly report, no way to flip to the previous or next week.
- **Opportunity:** Prev/next arrows in the report header. Keyboard: ← / →.
- **Effort:** S.
- **Tag:** post-v1 polish.

#### 3.8.4 Rich public share previews (OG card with stats, NOT content)
- **Current:** `/shared/weekly/[id]` has `robots: noindex, nofollow` and static OG title. Intentional — privacy-first.
- **Opportunity:** Keep content private. BUT generate a branded OG image via @vercel/og that shows: "A weekly report from Acuity · Week of [date range]" + Acuity logo. No content leakage; just richer link previews in Slack/Discord/Messages.
- **Effort:** S.
- **Tag:** post-v1 polish.

### 3.9 Account / subscription

#### 3.9.1 Dedicated web reminders page
- **Current:** Reminder time + days inline in `/account`. Mobile has `/reminders`.
- **Opportunity:** `/account/reminders` page with more affordances (per-day custom text, pause for a week, test notification button).
- **Effort:** M.
- **Tag:** post-v1 polish.

#### 3.9.2 Data export: finer controls
- **Current:** "Export all" zip, 1 per 7 days.
- **Opportunity:** Date-range picker + format picker (JSON / CSV / Markdown). Exports of <200 entries could be synchronous, returned in-browser. Larger ranges remain async.
- **Effort:** M.
- **Tag:** future consideration.

#### 3.9.3 Connected accounts preview (future Google Calendar, Health integrations)
- **Current:** Account page has no integrations section.
- **Opportunity:** Section reserved for integrations — initially empty or listing "Coming soon: Google Calendar, Apple Health (mobile)". Signals the product is growing.
- **Effort:** S (placeholder UI).
- **Tag:** future consideration.

### 3.10 Recording

#### 3.10.1 Global "record now" keyboard shortcut
- **Current:** `n` navigates to `/home#record`. Record button has to be visible + focused.
- **Opportunity:** Global shortcut (e.g., `Cmd+R` on Mac / `Ctrl+R` on Windows-Linux) opens a floating recording widget in the bottom-right of ANY signed-in page. Record without leaving the current context.
- **Effort:** M.
- **Rationale:** Rubric §7.1: shutdown ritual framing. Recording is the ritual — making it always-one-keystroke-away reinforces this. Mobile can't do this (no global keystroke); it's a web-native expansion.
- **Tag:** post-v1 polish.

#### 3.10.2 Audio preview before upload
- **Current:** Record → stop → immediate upload.
- **Opportunity:** Stop → playback audio + "Save" / "Re-record" choice. Users who misspoke can avoid spending a transcription credit.
- **Effort:** S.
- **Tag:** post-v1 polish.

### 3.11 Cross-cutting

#### 3.11.1 Performance: client-side cache layer parity with mobile
- **Current:** Mobile has `lib/cache.ts` (30s TTL SWR). Web relies on Next.js App Router route caching + `cache: 'no-store'` fetches.
- **Opportunity:** Port the pattern to web. SWR (`vercel/swr`) + `keepPreviousData: true` gets most of the way there. Key endpoints: `/api/entries`, `/api/goals/tree`, `/api/tasks?all=1`, `/api/lifemap`, `/api/user/progression`.
- **Effort:** M.
- **Rationale:** Makes desktop nav between tabs feel "instant," matching the mobile rhythm the 2026-04-24 perf audit locked in.
- **Tag:** post-v1 polish.

#### 3.11.2 Sentry PII scrub parity
- **Current:** Mobile has `scrubDeep` in `beforeSend` (`apps/mobile/lib/sentry.ts:48–93`). Web's Sentry init — verify it has equivalent hook.
- **Opportunity:** If web's `beforeSend` is missing, port the same scrubber. Otherwise confirm + document.
- **Effort:** S (verify + potentially port).
- **Tag:** v1 ship-blocker (privacy).

---

## §4 Recommended sprints

Priority-ordered. Each sprint is 2–4h of focused work.

### Sprint A — Parity-fix baseline (~3h) — v1 ship-blocker

**Goal:** Close the user-visible drift before App Store lands publicly.

| # | Change | File(s) | Effort | Type |
|---|---|---|---|---|
| A1 | Add Goals page title header on web (text-3xl+ "Goals" + "N in progress") | `apps/web/src/app/goals/*` | 20m | Parity |
| A2 | Apply `StickyBackButton` on entry detail, goal detail, theme detail, life audit detail, state of me detail, account | 6 files in `apps/web/src/app/*` | 60m | Parity |
| A3 | Port mobile's "stays-visible-on-check" visit-snapshot to web Tasks | `apps/web/src/app/tasks/task-list.tsx` | 60m | Parity |
| A4 | Audit web Sentry init for PII scrub; port `scrubDeep` if missing | `apps/web/src/lib/sentry.ts` (or wherever init lives) | 30m | v1 blocker |
| A5 | Bump main signed-in page headings to `text-4xl` (Home, Entries, Goals, Tasks, Insights) | 5 files | 30m | Parity |

### Sprint B — Desktop viewport basics (~3h) — post-v1 polish

| # | Change | File(s) | Effort | Type |
|---|---|---|---|---|
| B1 | Add `xl:max-w-6xl` / `2xl:max-w-7xl` to main signed-in pages | 5 files | 30m | Expansion |
| B2 | Hover preview on entry cards (summary + top 2 themes + mood popover) | `apps/web/src/app/entries/entries-list.tsx` | 90m | Expansion |
| B3 | Scale-down-then-up micro-animation on task check (replaces mobile haptic) | `apps/web/src/app/tasks/task-list.tsx` | 30m | Expansion |
| B4 | Theme Map constellation scales to full xl viewport | `apps/web/src/components/theme-map/ThemeConstellation.tsx` | 60m | Expansion |

### Sprint C — Reports uplift (~4h) — post-v1 polish

| # | Change | File(s) | Effort | Type |
|---|---|---|---|---|
| C1 | Weekly Report + Life Audit + State of Me two-column desktop layout (lg+: narrative left, sidebar stats right) | 3 files | 2h | Expansion |
| C2 | Next/previous navigation on Weekly Report | `apps/web/src/app/insights/weekly` area | 30m | Expansion |
| C3 | Branded OG card for `/shared/weekly/[id]` and `/shared/state-of-me/[id]` via @vercel/og | 2 route metadata blocks | 60m | Expansion |
| C4 | Home "recent artifacts" row beneath record button | `apps/web/src/app/home/page.tsx` | 30m | Expansion |

### Sprint D — Command palette + keyboard UX (~4h) — post-v1 polish

| # | Change | File(s) | Effort | Type |
|---|---|---|---|---|
| D1 | Install + wire cmdk | new file | 30m | Expansion |
| D2 | Fuzzy search across entries, goals, tasks, themes | cmdk palette | 90m | Expansion |
| D3 | Quick actions: Record, Go to X, Generate Weekly Report | cmdk palette | 30m | Expansion |
| D4 | Task list keyboard shortcuts: j/k nav, Space toggle, e edit, s snooze, d delete | `apps/web/src/app/tasks/task-list.tsx` | 60m | Expansion |
| D5 | Cmd+N opens command palette (not `n` on its own — that's route-nav today) | `apps/web/src/components/keyboard-shortcuts.tsx` | 10m | Expansion |

### Sprint E — Tasks + Goals power features (~4h) — post-v1 polish

| # | Change | File(s) | Effort | Type |
|---|---|---|---|---|
| E1 | Task editor modal on web (title + desc + priority + due + group in one) | new modal + wire into task-list | 90m | Parity |
| E2 | Bulk select + bulk actions on tasks (shift+click, Cmd+A, action bar slide-in) | `apps/web/src/app/tasks/task-list.tsx` | 90m | Expansion |
| E3 | Drag-to-reparent on goals via dnd-kit | `apps/web/src/app/goals/goal-list.tsx` | 60m | Expansion |

### Sprint F — Recording expansion (~3h) — future consideration

| # | Change | File(s) | Effort | Type |
|---|---|---|---|---|
| F1 | Floating recording widget triggered by Cmd+Shift+R globally | new + root layout | 2h | Expansion |
| F2 | Audio preview + re-record before upload | `apps/web/src/app/home/record-button.tsx` | 60m | Expansion |

### Sprint G — Performance cache parity (~2h) — post-v1 polish

| # | Change | File(s) | Effort | Type |
|---|---|---|---|---|
| G1 | Install `swr` + wrap key endpoints with `useSWR` | `apps/web/src/lib/swr-fetcher.ts` + 5–8 call sites | 90m | Perf parity |
| G2 | Focus-aware revalidation (`revalidateOnFocus: true`) on Home, Tasks, Goals, Entries | SWR config | 30m | Perf parity |

### Sprint H — PDF export (~4h) — post-v1 polish

| # | Change | File(s) | Effort | Type |
|---|---|---|---|---|
| H1 | Set up Puppeteer renderer as an Inngest job | `apps/web/src/inngest/pdf-renderer.ts` + `package.json` | 2h | Expansion |
| H2 | Styled print template for Weekly Report | new `.tsx` | 60m | Expansion |
| H3 | Styled print template for State of Me + Life Audit | new `.tsx` × 2 | 60m | Expansion |

---

## §5 Quick wins (<30 min each)

| # | Change | File | Rationale |
|---|---|---|---|
| QW1 | Swap Goals page to use `StickyBackButton` + add title header | `apps/web/src/app/goals/page.tsx` | 2 sprint-A items in one change |
| QW2 | Bump web home / goals / entries / tasks / insights page titles to `text-4xl` | 5 files | Typography parity with mobile |
| QW3 | Add `xl:max-w-6xl` to main signed-in pages | 5 files | Immediate desktop breathing room |
| QW4 | Add `scroll-mt-16` to section anchors on Reports so sticky-back doesn't cover the heading when URL has a hash | reports pages | Polish |
| QW5 | Add `Cmd+/` as alias for `/` search-focus shortcut | `keyboard-shortcuts.tsx` | Match the macOS "toggle help" convention |
| QW6 | Add `data-search-input` marker to `/tasks` search field once it gets one | future | Activates existing keyboard shortcut infrastructure |
| QW7 | Add `Esc` handler to collapse the Metrics Drawer on `/insights` | `apps/web/src/app/insights/metrics-drawer.tsx` | Small keyboard affordance |
| QW8 | Remove the inline `<BackButton />` imports that are now unused after Sprint A2 | 6 files | Cleanup after parity fix |
| QW9 | Add `max-w-7xl` to shared public views (`/shared/*`) so they breathe on desktop while remaining centered | 2 files | Low-risk polish |
| QW10 | Document the shared design-token palette in `docs/DESIGN_TOKENS.md` (colors, sentiment tones, spacing scale) | new doc | Reference for future parity work |

---

## §6 Questions for Jim

1. **Task editor modal on web: ship as parity or skip?**
   The mobile Task Editor covers 5 fields at once (title, description, priority, due, group). On web these are currently edited via different inline triggers. Is a unified modal a v1 priority or should we keep per-field inline editing? Affects Sprint E1.

2. **How aggressive should desktop viewport expansion be?**
   Three stances possible. (a) Conservative: keep `max-w-3xl` on content-heavy pages (Reports) for readability, only widen list pages. (b) Balanced: `xl:max-w-6xl` everywhere. (c) Aggressive: full-width minus gutters on dashboard / Theme Map / Life Matrix. Right now web is (a). Recommend (b). Your call?

3. **Command palette (Cmd+K) — power user or general user?**
   My default would be to ship it as always-on (opt-out via keyboard-shortcut settings). But if you expect Acuity's ICP to be less keyboard-native than Linear's / Figma's, we could hide it behind a setting until proven. Which framing?

4. **PDF export on reports: paid-only or free?**
   I can see arguments for either. (a) Free: the artifact IS the product; downloading it is table stakes. (b) Paid: PDF export is a premium artifact that justifies part of the subscription. Competitive note — Rosebud gates PDF behind a higher tier; Day One includes it. Recommend (a) free; want to confirm before Sprint H.

5. **Two-pane layouts (Entries, Goals, Theme Map): do we want them?**
   These are the biggest desktop-native wins but they introduce URL state complexity (which entry is selected, back button behavior, deep links). Fine to scope out for v1 if you'd rather not add the complexity. Affects Sprint C1, §3.5.1, §3.7.2, §3.4.3.

---

**End of audit.** Fix runs should pick Sprint A + Sprint B + Sprint G as the parity baseline, then tackle C/D/E/F/H in whatever order user feedback prioritizes.
