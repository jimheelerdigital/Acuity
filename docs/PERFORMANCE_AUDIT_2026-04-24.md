# Performance Audit — Acuity Mobile

**Date:** 2026-04-24
**Scope:** `apps/mobile` (Expo SDK 54 / React Native 0.81.5 / React 19 / Fabric + New Architecture / Hermes on iOS)
**Intent:** Enumerate every performance issue with location, impact, fix, effort. No changes made in this run.

---

## 0. Already shipped earlier today (commit `f958b99`) — do NOT re-ship

These are fixed. Listed here so a fix run doesn't duplicate work.

- ✅ Tasks screen: removed `await fetchAll()` after every PATCH + removed checkbox `busy/opacity:0.5` visual.
- ✅ Tasks screen: `useMemo` for `grouped` no longer invalidated every render (moved `Date.now()` inside memo body).
- ✅ Tasks screen: `TaskRow` and `GroupSection` wrapped in `React.memo`.
- ✅ `lib/cache.ts` created — module-level 30s-TTL cache with deduped in-flight requests + SWR hook.
- ✅ Home, Insights, Entries tabs: hydrate from cache; focus-refetch gated on `isStale()`.
- ✅ Haptic on task complete (iOS only, light impact).
- ✅ Theme Map: bubble cluster → Theme Gallery (hero + 2-up + 2×2 + strip rows).

**Items below are everything still outstanding.**

---

## 1. Executive summary — top items by user-visible impact

| # | Issue | Location | Severity | Effort |
|---|-------|----------|----------|--------|
| 1 | Goals tab still does `await fetchTree()` after every task toggle / goal mutation — same 2–3s stall the Tasks screen had | `app/(tabs)/goals.tsx:162–198` | **Critical** | S |
| 2 | `console.log` debug statements ship to production in Google sign-in flow | `lib/auth.ts` (8 call sites) | **Critical** | S |
| 3 | No `babel-plugin-transform-remove-console` — every `console.*` call in any file adds string serialization to prod | `babel.config.js` | **Critical** | S |
| 4 | Task editor modal fetches **the entire task list** to find one task by ID | `app/task/[id].tsx:67–70` | High | M |
| 5 | Auth context blocks first paint: `getToken()` → `api/user/me` awaits before any screen can render | `contexts/auth-context.tsx:51–89` + `_layout.tsx` AuthGate | High | M |
| 6 | Splash screen: no explicit `hideAsync()` — splash lingers until React's first render cascade completes | missing `expo-splash-screen` wiring | High | M |
| 7 | Theme Detail / Entry Detail / Goal Detail / Dimension screens do **not** use the cache; every navigate re-fetches | multiple | High | M (per screen) |
| 8 | Insights tab: `/api/lifemap/refresh` (expensive server-side recalc) fires on pull-to-refresh — fine — but also `/api/lifemap/trend` has no cache-staleness gate separate from the main lifemap | `app/(tabs)/insights.tsx:134–142` | Medium | S |
| 9 | Goals screen `groupedRoots` memo rebuilds Map on every `roots` change but `GOAL_GROUPS` is a stable constant — output array identity changes every render regardless | `app/(tabs)/goals.tsx:210–222` | Medium | S |
| 10 | `HomeFocusStack` `cards` memo depends on `dismissedIds` (a Set), but each dismiss creates a new Set → every other card's `render: () => ...` function is freshly allocated, defeating memo inside `FocusCardStack` | `components/home-focus-stack.tsx:29–61` | Medium | M |

---

## 2. Tab-by-tab findings

### 2.1 Home tab (`app/(tabs)/index.tsx`)

Post-cache-wiring, this is in good shape. Remaining:

- **Location:** `app/(tabs)/index.tsx:109` — `greetingFor(new Date())` runs on every render.
  **Severity:** Low
  **Impact:** A new `Date` allocation per render; hour lookup is cheap but the `greeting` string triggers a new `Text` child identity each render.
  **Fix:** `useMemo(() => greetingFor(new Date()), [])` — greeting doesn't need to change mid-session.
  **Effort:** S

- **Location:** `app/(tabs)/index.tsx:110–112` — `.filter()` + `Date.parse` over all entries to compute `weekCount` on every render.
  **Severity:** Low
  **Impact:** Runs on every parent re-render even when entries didn't change.
  **Fix:** Wrap in `useMemo` keyed on `entries`.
  **Effort:** S

- **Location:** `app/(tabs)/index.tsx:159–179` — `EntryRow` is defined inline in the same file. It's not `React.memo`'d and receives a new `onPress` closure per row per render.
  **Severity:** Low
  **Impact:** All 5 entry rows re-render on every state change in Home.
  **Fix:** Extract `EntryRow` into a `memo()`'d component; lift `onPress` via `useCallback` pattern or pass `entry.id` only and construct the router.push inside.
  **Effort:** S

### 2.2 Tasks tab (`app/(tabs)/tasks.tsx`)

Post-fix, this is in good shape. Remaining:

- **Location:** `app/(tabs)/tasks.tsx:156–171` — `useFocusEffect` fires `fetchAll(true)` on EVERY focus, not gated by `isStale`. The cache module has isStale but Tasks bypasses it.
  **Severity:** Medium
  **Impact:** Every tab return re-fetches two endpoints even if the cache is 2 seconds old. On 3G this costs 300–800ms of background traffic per focus.
  **Fix:** Gate `fetchAll(true)` with `if (isStale(TASKS_CACHE_KEY) || isStale(GROUPS_CACHE_KEY))`.
  **Effort:** S

- **Location:** `app/(tabs)/tasks.tsx:354` — `tabs` array + its objects are recreated on every render (inline object literals).
  **Severity:** Low
  **Impact:** The three tab `Pressable` children receive new prop objects per render.
  **Fix:** Hoist static labels to a module constant; pass `count` separately.
  **Effort:** S

### 2.3 Goals tab (`app/(tabs)/goals.tsx`) — **NOT YET FIXED**

- **Location:** `app/(tabs)/goals.tsx:162–168` — `performAction` awaits PATCH then awaits `fetchTree()`. Same anti-pattern as the Tasks bug that was fixed this morning.
  **Severity:** Critical
  **Impact:** Completing/archiving/starting/restoring a goal blocks the UI for 1.5–3s until the refetch returns.
  **Fix:** Optimistically update the tree node in state; fire the PATCH without awaiting; reconcile on focus.
  **Effort:** M

- **Location:** `app/(tabs)/goals.tsx:170–186` — `deleteGoal` → `await api.del` → `await fetchTree`. Same pattern.
  **Severity:** High
  **Impact:** Delete action feels unresponsive; spinner-less blank until refetch lands.
  **Fix:** Optimistic removal from state; reconcile on focus.
  **Effort:** M

- **Location:** `app/(tabs)/goals.tsx:188–198` — `toggleTask` → PATCH → `fetchTree`. Worst offender because a user may check several task leaves quickly.
  **Severity:** Critical
  **Impact:** Every task check under a goal suffers the same 3s stall the top-level Tasks tab used to have.
  **Fix:** Optimistic update of the specific leaf node's `status`; fire PATCH in the background.
  **Effort:** M

- **Location:** `app/(tabs)/goals.tsx:138–142` — `useFocusEffect` refetches unconditionally on every focus.
  **Severity:** Medium
  **Impact:** Tab switch always network-hits; blank UI on first focus of this tab.
  **Fix:** Seed state from `getCached(...)` + gate refetch on `isStale(...)`, same pattern as Home/Insights/Entries.
  **Effort:** M

- **Location:** `app/(tabs)/goals.tsx:94–108` — 11 separate `useState` hooks for related tree state.
  **Severity:** Low
  **Impact:** Each state change triggers a full component render; difficult to batch.
  **Fix:** Consolidate into a reducer where updates can be batched, or group into `{ tree, loading, ... }` object state.
  **Effort:** M

- **Location:** `app/(tabs)/goals.tsx:210–222` — `groupedRoots` `useMemo` produces a NEW array identity every time `roots` changes even if group content is identical; every `GroupSection` downstream re-renders.
  **Severity:** Medium
  **Impact:** Every goal tree repaint re-renders all groups.
  **Fix:** Memoize each group's tasks array by reference stability (Map keyed on `group.id`), not by rebuilding arrays unconditionally.
  **Effort:** M

- **Location:** `app/(tabs)/goals.tsx:200–208` — `inProgressCount` walks the whole tree recursively on every render. Linear in tree size.
  **Severity:** Low
  **Impact:** For 100+ goals, this is still <5ms but wasteful.
  **Fix:** Compute in the same `useMemo` that builds `groupedRoots`.
  **Effort:** S

### 2.4 Insights tab (`app/(tabs)/insights.tsx`)

Post-fix, generally good. Remaining:

- **Location:** `app/(tabs)/insights.tsx:134–142` — `onRefresh` posts `/api/lifemap/refresh` (which re-scores lifemap server-side via AI) on every pull-to-refresh.
  **Severity:** Medium
  **Impact:** Pull-to-refresh now triggers a heavy backend compute; slow + costs LLM tokens.
  **Fix:** Split "refresh UI" (re-fetch cached data) from "recompute lifemap" (user-initiated button). Pull-to-refresh should only refetch; lifemap recompute should be a separate explicit action.
  **Effort:** M

- **Location:** `app/(tabs)/insights.tsx:162–167` — `moodEntries`, `timelineEntries`, `latestReport`, `sevenDaysAgo` computed in the render body (not memoized).
  **Severity:** Low
  **Impact:** Array filters + date math run on every render, even when entries didn't change. Minor cost.
  **Fix:** Wrap in `useMemo` keyed on `entries`/`reports`.
  **Effort:** S

- **Location:** `app/(tabs)/insights.tsx:74–76` — `recurringThemes`, `recurringPeople`, `recurringGoals` typed as `any[]`.
  **Severity:** Low
  **Impact:** Not perf; type-safety hole that hides potential bad shape handling.
  **Fix:** Define proper response types; validate.
  **Effort:** S

- **Location:** `app/(tabs)/insights.tsx` — Insights tab reads `useTheme()` for `isDark` and passes it into `LifeMapRadar`. Theme context re-renders trigger a full Insights tab repaint.
  **Severity:** Low
  **Impact:** If the user ever toggles theme while on Insights, the heavy radar + area cards repaint.
  **Fix:** Defer — rare event; noted only.
  **Effort:** —

### 2.5 Entries tab (`app/(tabs)/entries.tsx`)

Post-fix, in good shape. Remaining:

- **Location:** `app/(tabs)/entries.tsx:66–79` — `filtered` `useMemo` does a substring search over `transcript + summary + themes.join(" ")` on every keystroke for every entry.
  **Severity:** Medium
  **Impact:** For 100+ entries with long transcripts, typing in the search box can lag 50–150ms per keystroke.
  **Fix:** Debounce `query` (200ms) before feeding into the filter. Alternatively, lowercase the haystack once at fetch time.
  **Effort:** S

- **Location:** `app/(tabs)/entries.tsx:163–201` — `FlatList` renders with default window/batching. No `keyExtractor` optimization needed (it's fine as-is), but no `windowSize` / `maxToRenderPerBatch` / `removeClippedSubviews` tuning.
  **Severity:** Low
  **Impact:** For typical list lengths (100–500 entries) default FlatList is fine; watch if lists grow past 1k.
  **Fix:** Add `initialNumToRender={12} maxToRenderPerBatch={8} windowSize={9} removeClippedSubviews={true}` if scroll feels janky on long lists.
  **Effort:** S

- **Location:** `app/(tabs)/entries.tsx:271–283` — `formatRelativeDate` allocates multiple `Date` objects per row, per render.
  **Severity:** Low
  **Impact:** Minor; adds up with 500 rows during a scroll.
  **Fix:** Pre-format at fetch time or wrap the row map in a memoized transform.
  **Effort:** S

---

## 3. Screen-by-screen findings

### 3.1 Theme Detail (`app/insights/theme/[themeId].tsx`)

- **Location:** `app/insights/theme/[themeId].tsx:61–68` — Fetches `/api/insights/theme/[id]` directly, no cache, no abort on unmount.
  **Severity:** High
  **Impact:** Every tap on a theme in the Gallery re-fetches the same data, even if user just came back from the same theme. Slow on flaky connections.
  **Fix:** Route through `lib/cache.ts` with a path-keyed entry. Add AbortController for unmount.
  **Effort:** S

- **Location:** `components/theme-detail/AreaChart.tsx:47–56, 203–262` — The Fritsch-Carlson monotone cubic path is re-computed on every render.
  **Severity:** Medium
  **Impact:** For each chart render, a loop over `trend.length` points + allocations. ~1–3ms per render; noticeable if the chart is inside an animated parent.
  **Fix:** Wrap path + area-fill string in `useMemo` keyed on `trend`.
  **Effort:** S

- **Location:** `components/theme-detail/AreaChart.tsx:203–262` — `monotoneCubicPath` allocates `dxs`, `slopes`, `tangents` arrays inside the function, every call.
  **Severity:** Low
  **Impact:** GC pressure if chart re-renders in a loop.
  **Fix:** Accept preallocated arrays, or compute inline without intermediate arrays.
  **Effort:** L

### 3.2 Entry Detail (`app/entry/[id].tsx`)

- **Location:** `app/entry/[id].tsx:23–35` — `reload` uses `useEffect` + no cache + no abort + no in-flight dedup.
  **Severity:** High
  **Impact:** Navigate to an entry → wait for network even if you just came from it. No spinner-free re-entry.
  **Fix:** Route through `lib/cache.ts`.
  **Effort:** S

- **Location:** `app/entry/[id].tsx:53–57` — `new Date().toLocaleDateString()` in render.
  **Severity:** Low
  **Impact:** One Date+format per render; minor.
  **Fix:** `useMemo` keyed on `entry.createdAt`.
  **Effort:** S

- **Location:** `app/entry/[id].tsx:82` — `ExtractionReview` receives `entry.id` (stable) + `reload` (fresh identity per render because `reload` isn't `useCallback`'d).
  **Severity:** Medium
  **Impact:** Every parent render re-renders ExtractionReview (which itself has internal state + fetches).
  **Fix:** Wrap `reload` in `useCallback([id])`.
  **Effort:** S

- **Location:** `app/entry/[id].tsx:108–128` — `.map()` over `wins` / `blockers` uses array `index` as key.
  **Severity:** Low
  **Impact:** If the arrays ever get reordered (e.g., user edits), React would mis-match children. Not observably broken today.
  **Fix:** Use content-derived keys (e.g., `${i}-${win.slice(0,8)}`) or accept the risk.
  **Effort:** S

### 3.3 Goal Detail (`app/goal/[id].tsx`)

- **Location:** `app/goal/[id].tsx:83–99` — Five separate `setState` calls after a single fetch.
  **Severity:** Medium
  **Impact:** React 18+ auto-batches these, so only one render cycle fires — but any one setState failing leaves split state. Not a perf issue, a correctness risk.
  **Fix:** Single `setState({ goal, linked, ... })` object.
  **Effort:** M

- **Location:** `app/goal/[id].tsx:208–215` — `ProgressSuggestionBanner` `onProgressUpdated` calls `load()`.
  **Severity:** Medium
  **Impact:** After accepting a suggestion, the whole goal screen re-fetches instead of patching in the new state.
  **Fix:** Optimistically splice the new progress row into local state; refetch only on failure.
  **Effort:** M

- **Location:** `app/goal/[id].tsx:293–316` — `[0, 25, 50, 75, 100]` array literal + its `.map()` inside render body.
  **Severity:** Low
  **Impact:** Tiny; recreated every render.
  **Fix:** Hoist to module const.
  **Effort:** S

### 3.4 Dimension Detail (`app/dimension/[key].tsx`)

- **Location:** `app/dimension/[key].tsx:237–241` — `new Date(e.createdAt).toLocaleDateString()` inside `.map()` row render.
  **Severity:** Medium
  **Impact:** For 20 entries, 20 Date+format calls per screen render; repeats on any parent state change.
  **Fix:** Memoize row list with useMemo keyed on entries.
  **Effort:** S

- **Location:** `app/dimension/[key].tsx:349–374` — `Sparkline` recomputes `max/min/range` on every render.
  **Severity:** Low
  **Impact:** Small arrays (30 points), negligible.
  **Fix:** `useMemo` if ever used in a list.
  **Effort:** S

### 3.5 Task Editor modal (`app/task/[id].tsx`)

- **Location:** `app/task/[id].tsx:67–70` — Fetches **the entire tasks list** (`/api/tasks?all=1`) to find one task by `id`.
  **Severity:** High
  **Impact:** Opening a task editor modal downloads every task the user owns. For users with 100+ tasks, this is a >100KB payload per tap.
  **Fix:** Hit `/api/tasks/{id}` (create endpoint if absent) for a single-task GET. Fall back to reading the cached `/api/tasks?all=1` result from `lib/cache.ts` if present.
  **Effort:** M

- **Location:** `app/task/[id].tsx:63` — `useTheme()` read for `isDark` despite the modal already inheriting dark from the RN color scheme through NativeWind.
  **Severity:** Low
  **Impact:** Modal re-renders on any theme change across the app.
  **Fix:** Drop the `useTheme` usage; use `dark:` Tailwind variants consistently.
  **Effort:** S

- **Location:** `app/task/[id].tsx:118–123` — Edit-then-move fires two sequential PATCH calls (`edit` then `move`) when group changes.
  **Severity:** Low
  **Impact:** 2× network latency for a save with a group change.
  **Fix:** Allow the edit PATCH to accept an optional `groupId` on the server; merge into one call.
  **Effort:** M

### 3.6 Record screen (`app/record.tsx`)

- **Location:** `app/record.tsx:202–213` — `setOnRecordingStatusUpdate` fires `setLevels((prev) => [...prev.slice(1), normalized])` on every metering callback. expo-av default `progressUpdateIntervalMillis` is 500ms (≈2 Hz), NOT 60Hz as one might assume.
  **Severity:** Medium
  **Impact:** 2 setState/sec for the duration of recording. The `levels` array replacement triggers re-renders of the level-bar children every 500ms. Not a jank source on modern devices, but on older iPhones during the ~2 min recording window it accumulates.
  **Fix:** (a) Move levels to a Reanimated `useSharedValue` so the visualization animates on the UI thread without JS-thread setState. Or (b) throttle updates to 1 Hz for the bar viz.
  **Effort:** M

- **Location:** `app/record.tsx:219–227` — `setInterval` for elapsed-second tick with an inline `if (s+1 >= MAX_SECONDS) stopRecording()` inside the state updater.
  **Severity:** Low
  **Impact:** 1 Hz setState; triggers full render of the record screen every second. Elapsed display + cap check are JS-thread.
  **Fix:** Move elapsed display into a Reanimated clock or compute at render time from `startTime` ref + a lightweight 1 Hz tick that only invalidates a small subtree.
  **Effort:** M

- **Location:** `app/record.tsx:269–279` — `FormData` is constructed once (good) outside the retry loop, but `getToken()` is also outside. ✓ Correct — no rebuild per attempt. The agent's earlier claim that FormData is rebuilt per attempt is INCORRECT; source confirms it's built once.
  **Severity:** N/A
  **Note:** No fix required.

- **Location:** `app/record.tsx:229` — `console.warn("[record] prepare failed:", err)`.
  **Severity:** Low
  **Impact:** Ships to prod. Sentry will catch the underlying error via `initSentry`, so the warn is redundant.
  **Fix:** Remove; let Sentry capture.
  **Effort:** S

- **Location:** `app/record.tsx:284+` — upload retry loop with 3 attempts, no per-attempt timeout, no in-UI progress feedback.
  **Severity:** Medium
  **Impact:** On slow networks, user sees "Uploading…" for up to 60s with no indication of progress or which retry is in flight.
  **Fix:** Add bytes-uploaded or attempt-count feedback. Add per-attempt fetch timeout with AbortController.
  **Effort:** M

### 3.7 Auth screens (`app/(auth)/*`)

- **Location:** `lib/auth.ts` — 8 `console.log` calls in the Google sign-in path (explicitly `// eslint-disable-next-line no-console`).
  **Severity:** Critical
  **Impact:** Every sign-in ships 8 log serializations to Hermes. More importantly, they log `redirectUri`, HTTP status codes, and response types — borderline PII + leaks of auth internals.
  **Fix:** Remove the `console.log` lines entirely; they've served their debugging purpose. Or gate every one behind `if (__DEV__)`.
  **Effort:** S

- **Location:** `app/auth-callback.tsx:38–68` — `completeMobileMagicLink` runs in an async IIFE. Failure path shows static error text with no retry button.
  **Severity:** Medium
  **Impact:** If the token exchange fails, user is stuck — must force-close the app.
  **Fix:** Render a "Try again" button on failure that re-runs the exchange.
  **Effort:** M

### 3.8 Onboarding (`app/onboarding.tsx` + `components/onboarding/*`)

- **Location:** `components/onboarding/shell.tsx:62–72` — `contextValue` `useMemo` deps may be incomplete — needs verification against current `setCanContinue` / `setCapturedData` identity.
  **Severity:** Medium
  **Impact:** If deps are missing, step components read stale callbacks; "Continue" button may not re-enable correctly.
  **Fix:** Audit deps; pass through `useCallback`'d setters.
  **Effort:** S

- **Location:** `components/onboarding/step-*.tsx` — spot-check every step for missed `useCallback` on the setter interaction (reported as cross-cutting risk).
  **Severity:** Low
  **Impact:** Potential stale closures on step transitions.
  **Fix:** Audit file-by-file.
  **Effort:** M

### 3.9 Reminders (`app/reminders.tsx`)

- **Location:** `app/reminders.tsx:136` — `applyReminderSchedule` has no error surface if OS scheduling fails.
  **Severity:** Medium
  **Impact:** Silent failure leaves user thinking reminders are set when they aren't.
  **Fix:** Surface an error state with a retry; log to Sentry.
  **Effort:** M

### 3.10 Paywall (`app/paywall.tsx`)

No material perf issues found. Static content.

---

## 4. Component findings

### 4.1 `components/home-focus-stack.tsx`

- **Location:** `components/home-focus-stack.tsx:29–61` — `cards` `useMemo` allocates fresh `render: () => <UnlockCard ... />` / `render: () => <MilestoneCard ... />` closures every time `dismissedIds` OR `progression` changes. Those closures become new function identities for `FocusCardStack`, defeating its internal memo.
  **Severity:** Medium
  **Impact:** Every dismissal triggers re-render of ALL remaining cards (not just the dismissed one).
  **Fix:** Move `render` into the `FocusCard` component as a real component reference; or wrap render bodies in stable `useCallback`s.
  **Effort:** M

- **Location:** `components/home-focus-stack.tsx:67–74` — `onDismiss` prop is an inline arrow function.
  **Severity:** Low
  **Impact:** New callback identity per render of `HomeFocusStack` → `FocusCardStack` can't memo on prop equality.
  **Fix:** `useCallback` with `[]` deps.
  **Effort:** S

### 4.2 `components/focus-card-stack.tsx`

- **Location:** `components/focus-card-stack.tsx:125–139` — `Layer` (the non-top card behind the foreground) has `pointerEvents="none"` but still re-renders on every parent update.
  **Severity:** Medium
  **Impact:** A 3-card stack means 2 background layers re-render on every top-card swipe animation tick.
  **Fix:** Wrap `Layer` in `React.memo` with shallow prop comparison.
  **Effort:** S

### 4.3 `components/life-map-radar.tsx`

- **Location:** `components/life-map-radar.tsx:73–96` — `polyPoints` string is built via `.map().join()` on every render.
  **Severity:** Medium
  **Impact:** For the 6-point radar, cost is small (~100µs), but the radar re-renders on theme toggles + Insights tab state changes.
  **Fix:** `useMemo(polyPoints, [areas, size, ...])`.
  **Effort:** S

- **Location:** `components/life-map-radar.tsx:200` — `<G onPress={...}>` — react-native-svg's `<G>` doesn't reliably receive touches on all platforms under Fabric.
  **Severity:** Medium
  **Impact:** Tappable axis labels may not work on iOS 18 / Android 14 under New Architecture.
  **Fix:** Wrap with `Pressable` above the SVG or use `react-native-gesture-handler` `TapGestureDetector`.
  **Effort:** M

### 4.4 `components/extraction-review.tsx`

- **Location:** `components/extraction-review.tsx:42–60` (estimated) — `useEffect` fetch without AbortController or `isMounted` flag.
  **Severity:** Medium
  **Impact:** If the user closes Entry Detail mid-fetch, a setState-after-unmount warning fires and the response is wasted bandwidth.
  **Fix:** AbortController.
  **Effort:** S

- **Location:** `components/extraction-review.tsx:162–165` — inline arrow function passed to `setTasks`.
  **Severity:** Low
  **Impact:** Minor.
  **Fix:** `useCallback`.
  **Effort:** S

### 4.5 `components/milestone-card.tsx`

- **Location:** `components/milestone-card.tsx:134–145` — Confetti `Particle` components (30–45 of them) are not `React.memo`'d.
  **Severity:** Medium
  **Impact:** Every parent repaint re-renders every particle — this is a visible jank source during unlock celebrations.
  **Fix:** `React.memo(Particle)`.
  **Effort:** S

- **Location:** `components/milestone-card.tsx:184–193` — `useEffect` depends on `repeat` but only reads it once.
  **Severity:** Low
  **Fix:** Document or include properly.
  **Effort:** S

### 4.6 `components/progress-suggestion-banner.tsx`

- **Location:** `components/progress-suggestion-banner.tsx:42–59` — `useEffect` fetch, no AbortController.
  **Severity:** Medium
  **Impact:** Setstate-after-unmount warnings possible; wasted bandwidth on unmount.
  **Fix:** AbortController.
  **Effort:** S

### 4.7 `components/user-insights-card.tsx`, `components/progression-checklist.tsx`, `components/recommended-activity.tsx`

Cross-cutting pattern — see §6.5 below.

### 4.8 `components/theme-detail/*`

- **Location:** `components/theme-detail/InsightCard.tsx:20–32` — hard-coded SVG gradient id `"insight-bg"`.
  **Severity:** Low
  **Impact:** If two `InsightCard`s ever render on the same page, they share the gradient definition. Today only one renders per screen; the bug is latent.
  **Fix:** Use `React.useId()` for gradient ids.
  **Effort:** S

- **Location:** `components/theme-map/HeroMetricsCard.tsx:44–57` — same hard-coded id `"hero-bg"` pattern.
  **Severity:** Low
  **Fix:** Same.
  **Effort:** S

### 4.9 `components/theme-map/LockedState.tsx`

- **Location:** `components/theme-map/LockedState.tsx:40–57` — teaser SVG re-renders on every parent update.
  **Severity:** Low
  **Impact:** Static illustration; re-renders unnecessary.
  **Fix:** Wrap component in `React.memo`.
  **Effort:** S

### 4.10 `hooks/use-entry-polling.ts`

- **Location:** `hooks/use-entry-polling.ts:103–109` — the `elapsedSeconds` `setInterval` is not cleared when the polling times out after 3 min; only cleared on unmount.
  **Severity:** Medium
  **Impact:** After a failed poll times out, the 1 Hz tick keeps running until the user leaves the screen.
  **Fix:** Clear `elapsedTickHandle` in the timeout branch.
  **Effort:** S

- **Location:** `hooks/use-entry-polling.ts:121–123` — `getToken()` is called on every poll attempt (7+ times in 3 min).
  **Severity:** Low
  **Impact:** Secure-store reads are async + cost ~5–15ms each. 7 × 10ms = 70ms of wasted latency across a poll cycle.
  **Fix:** Fetch token once at hook start; pass into each poll.
  **Effort:** S

---

## 5. System / bundle / config findings

### 5.1 Confirmed OK (no action needed)

- ✅ **Hermes on iOS:** `ios/Podfile.properties.json` sets `"expo.jsEngine": "hermes"`. Confirmed.
- ✅ **Hermes on Android:** Expo SDK 54 defaults to Hermes for Android; no explicit `jsEngine` needed in app.json. If verification is wanted, check EAS build logs for `"Hermes engine enabled"` line.
- ✅ **New Architecture / Fabric:** Enabled by default on Expo SDK 54 when `newArchEnabled` is not set to `false`. Podfile defaults `RCT_NEW_ARCH_ENABLED=1` unless explicitly disabled (verified in `ios/Podfile:15–18`). The progress log also refers to "Fabric New Architecture" in the 2026-04-23 Pressable-functional-style bug note. Confirmed on.
- ✅ **Reanimated babel plugin:** Last in plugins array (`babel.config.js:15`). Correct.
- ✅ **NativeWind jsxImportSource:** Preset is correctly set (`babel.config.js:9`). No separate plugin needed under v4.
- ✅ **Supabase client:** Single module-scope instance in `lib/supabase.ts`; no per-mount reinstantiation.
- ✅ **AppState listener:** One listener in `auth-context.tsx`, cleaned up on unmount. No leaks.
- ✅ **`lucide-react-native` imports:** All use named tree-shakeable imports (`import { Flame } from "lucide-react-native"`). No wildcards.

### 5.2 Action items

- **Where:** `babel.config.js`
  **Severity:** Critical
  **Pattern:** No `babel-plugin-transform-remove-console` in production config.
  **Impact:** Every `console.log` / `warn` / `error` ships to prod. Hermes still serializes the arguments even if nothing's listening. Cost: 5–20ms per call site + bundle bloat.
  **Fix:** Add `["transform-remove-console", { exclude: ["error", "warn"] }]` to the `plugins` array. Keep `error`/`warn` so Sentry integration can still see them.
  **Effort:** S

- **Where:** `lib/auth.ts` (multiple call sites in Google sign-in path)
  **Severity:** Critical
  **Pattern:** Explicit `console.log("[auth] ...")` debug statements with `// eslint-disable-next-line no-console`.
  **Impact:** Shipped to prod. Even with `transform-remove-console`, these should be removed at source since the comment says "Remove once sign-in ships cleanly."
  **Fix:** Delete the `console.log` lines; they've served their purpose.
  **Effort:** S

- **Where:** `package.json` — `expo-audio: ~1.1.1` listed as dependency.
  **Severity:** High
  **Pattern:** Unused dependency; every recording + playback path imports `expo-av`, never `expo-audio`. Verified via grep.
  **Impact:** ~40–50KB of native bindings + JS glue bundled for no reason.
  **Fix:** `npm uninstall expo-audio`; verify build.
  **Effort:** S

- **Where:** `app.json:43–50` (Android permissions)
  **Severity:** Low
  **Pattern:** `RECORD_AUDIO` and `android.permission.RECORD_AUDIO` both listed, each twice.
  **Impact:** Redundant entries; Expo dedupes on build, but it's confusing config.
  **Fix:** Reduce to `["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"]`.
  **Effort:** S

- **Where:** `app/_layout.tsx` (missing `expo-splash-screen` wiring)
  **Severity:** High
  **Pattern:** No explicit `SplashScreen.preventAutoHideAsync()` / `SplashScreen.hideAsync()` calls.
  **Impact:** Expo auto-hides the splash as soon as React mounts. But our first render mounts `<ActivityIndicator>` from the AuthGate (because `loading=true` for the first ~300–800ms). So the user sees: splash → white screen with spinner → content. The "white spinner flash" is the perceived lag.
  **Fix:** Call `SplashScreen.preventAutoHideAsync()` at the top of `_layout.tsx`, then hide in a `useEffect` gated on `auth.loading === false && theme hydrated`.
  **Effort:** M

- **Where:** `contexts/auth-context.tsx:51–89` + AuthGate
  **Severity:** High
  **Pattern:** First-paint blocks on `getToken()` (async SecureStore read) → `/api/user/me` (network). AuthGate blocks routing until `loading === false`.
  **Impact:** Cold start shows spinner for ~300–800ms before any screen renders. Warm restarts hit AsyncStorage cache so are faster, but still sequential.
  **Fix:** Two-tier hydrate: synchronous render from `getStoredUser()` cache → background revalidation against server. Move any auth-blocking logic out of the critical path for already-signed-in users.
  **Effort:** M

- **Where:** `metro.config.js` (optional)
  **Severity:** Low
  **Pattern:** No inline-requires + no explicit minifier passes configured.
  **Impact:** Startup bundle is parsed entirely at boot. Inline-requires defers module load until first use, shaving ~100–200ms cold start on large apps.
  **Fix:** `config.transformer.getTransformOptions = async () => ({ transform: { inlineRequires: true, experimentalImportSupport: false } })`.
  **Effort:** S

- **Where:** `tsconfig.json` (optional, not perf but dev ergonomics)
  **Severity:** Low
  **Pattern:** No `"incremental": true`.
  **Impact:** Cold typechecks run from scratch.
  **Fix:** Add `"incremental": true` + `"tsBuildInfoFile"`.
  **Effort:** S

### 5.3 Things to VERIFY (agent reported but not independently confirmed)

- Check EAS build logs for confirmation that Hermes is enabled on Android.
- Check whether `newArchEnabled` should be set explicitly in `app.json` for clarity — it's currently implicit.
- Verify `@types/d3-force` is the only `d3-force` usage path and the actual `d3-force` lib is used in any runtime path (I haven't verified if it's imported at runtime or only in type position; if only types, the lib can be removed).

---

## 6. Cross-cutting patterns

### 6.1 `await refetch()` after mutations (critical, recurring)

**Files affected:**
- `app/(tabs)/goals.tsx:162–198` (unfixed) — 3 call sites
- `app/(tabs)/insights.tsx:144–159` — `generateReport` awaits `fetchData` (acceptable here because it's a user-triggered long op, but could be optimistic).
- Possibly others in detail screens.

**Pattern:** `async handler() { await api.patch(...); await fetchX(); }`

**Fix template:** Optimistic update → fire-and-forget PATCH with `.catch(() => invalidate(key))` → reconcile on next focus.

**Effort:** M per call site.

### 6.2 Detail screens bypass the cache

`app/entry/[id].tsx`, `app/insights/theme/[themeId].tsx`, `app/goal/[id].tsx`, `app/dimension/[key].tsx`, `app/task/[id].tsx` all use `useEffect` + `api.get` + `setState` with no `lib/cache.ts` integration.

**Impact:** Every navigate re-hits the network even for data the user just loaded.

**Fix:** Either use `useCachedResource<T>(path)` hook from `lib/cache.ts`, or manually `getCached` / `setCached` + stale-gate.

**Effort:** S per screen.

### 6.3 `useEffect` fetch without AbortController / isMounted

Affected: `app/insights/theme/[themeId].tsx`, `app/entry/[id].tsx`, `components/extraction-review.tsx`, `components/progress-suggestion-banner.tsx`, `components/comparisons-card.tsx`, `components/user-insights-card.tsx`, `components/progression-checklist.tsx`.

**Impact:** On rapid navigation, `setState-after-unmount` warnings fire and response bandwidth is wasted.

**Fix:** Either introduce a shared `useAbortableFetch` or always wire an AbortController.

**Effort:** Per-file S. Plus one shared hook.

### 6.4 Fire-and-forget error swallowing

Affected: `components/user-insights-card.tsx:49–51`, `components/progression-checklist.tsx:50–52`, `components/recommended-activity.tsx:26–42`, `lib/cache.ts:54` (optimistic mutation error handling) — `.catch(() => {})` pattern.

**Impact:** Silent failures. User doesn't know when state didn't persist.

**Fix:** At minimum `.catch((err) => Sentry.captureException(err))`. For user-triggered mutations, surface a toast / Alert.

**Effort:** M (needs a toast component first).

### 6.5 Inline callbacks defeating `React.memo`

Recurring across: `app/(tabs)/goals.tsx` TreeNode props, `app/(tabs)/index.tsx` EntryRow, `components/home-focus-stack.tsx`, `components/extraction-review.tsx`, etc.

**Pattern:** Parent passes `onX={() => doSomething(item.id)}` directly to a memoized child → new function identity every render → memo never fires.

**Fix:** Either pass primitive props (`id`) + construct the callback inside the child from a stable `useCallback`, or lift callbacks at the parent with `useCallback`.

**Effort:** File-by-file S; repo-wide audit L.

### 6.6 Date formatting inside render / inside `.map()`

Affected: `app/(tabs)/index.tsx:109–112`, `app/(tabs)/entries.tsx:271–283` (formatRelativeDate per row), `app/(tabs)/insights.tsx:383–400` (timeline cards), `app/entry/[id].tsx:53`, `app/dimension/[key].tsx:237–241`, `components/home-focus-stack.tsx` (via MilestoneCard children possibly).

**Impact:** `new Date().toLocaleDateString()` is cheap individually (~50µs) but adds up over dozens of rows, and runs on every render regardless of whether the date changed.

**Fix:** Pre-format dates at fetch time (server could return pre-formatted strings in the response) OR memoize row-wise with useMemo.

**Effort:** M (requires deciding where to own formatting).

### 6.7 `useFocusEffect` that refetches unconditionally

Still present on Goals tab. Fixed on Home/Insights/Entries/Tasks.

**Fix:** Same pattern — `if (isStale(key)) fetch()`.

**Effort:** S per tab.

### 6.8 SVG gradient id collisions (low-impact latent bug)

`InsightCard` + `HeroMetricsCard` use hard-coded ids. No collision today (one instance each per screen) but a latent bug.

**Fix:** `React.useId()`.

**Effort:** S.

---

## 7. Recommended execution order

Ordered by (user-visible impact × low-fix-risk):

**Sprint 1 — highest bang for buck (~4 hours total):**
1. Goals tab: fix `await fetchTree` anti-pattern on all 3 handlers (performAction, deleteGoal, toggleTask) + add cache-seed pattern. Mirrors the Tasks fix. **M**
2. `babel-plugin-transform-remove-console` in production. **S**
3. Delete the 8 `console.log` lines in `lib/auth.ts`. **S**
4. Remove `expo-audio` from package.json. **S**
5. Wire `expo-splash-screen.preventAutoHideAsync` + `hideAsync` in `_layout.tsx` gated on auth+theme ready. **M**
6. Detail screens use `lib/cache.ts` (Entry Detail, Theme Detail, Goal Detail, Dimension, Task Editor). **S each, 5 screens**

**Sprint 2 — targeted wins (~4 hours):**
7. Task Editor: switch from "fetch all tasks" to single-task fetch (create `/api/tasks/[id]` endpoint first). **M**
8. `HomeFocusStack` `render` functions stability + `Layer` React.memo. **M**
9. `MilestoneCard` confetti `Particle` React.memo. **S**
10. `hooks/use-entry-polling.ts` cleanup on timeout + token-once. **S**
11. Tasks tab: stale-gate the focus refetch. **S**
12. Entries search: 200ms debounce. **S**
13. AbortController on all detail-screen fetches + banner fetches. **M** (introduce shared hook).

**Sprint 3 — polish (~4 hours):**
14. Record screen levels → Reanimated shared value. **M**
15. AreaChart path memoization. **S**
16. LifeMapRadar polyPoints memoization + Pressable wrapper on axis labels. **M**
17. Date formatting cleanup pass (memoize at row level in the 6 affected files). **M**
18. `React.useId()` for SVG gradient ids. **S**
19. Inline callback cleanup pass for memo'd children (Home EntryRow, Goals TreeNode, etc.). **M**
20. metro inline-requires config. **S**

**Sprint 4 — longer plays:**
21. Auth context two-tier hydrate for instant first paint. **M**
22. Insights pull-to-refresh: split UI refetch from lifemap-recompute button. **M**
23. Introduce a shared `useAbortableFetch` + `useMutation` pattern (or adopt react-query). **L**
24. Fire-and-forget error surface (toast component + wiring). **M**
25. Onboarding step `useCallback` deps audit. **M**

---

## 8. Out-of-scope items (not perf, noting for visibility)

- `recurringThemes`/`recurringPeople`/`recurringGoals` typed as `any[]` (insights.tsx).
- Type-casting `AnimatedCircle: any` around react-native-svg + React 19 typing gap (documented in progress log).
- Duplicate Android permission entries in `app.json`.

---

**End of audit.** Fix runs should pick one sprint at a time. Recommend shipping Sprint 1 as a single PR since those items are tightly related and all reduce cold/warm interaction latency.
