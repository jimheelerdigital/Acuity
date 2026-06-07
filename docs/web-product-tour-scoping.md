# Web Product Tour — Scoping Proposal (≈ iOS 7-step)

**Status:** Proposal only. No code. Needs Keenan's input on web-layout assumptions before implementation.
**Date:** 2026-06-05
**Goal:** a first-login guided tour on the authenticated web app, equivalent in intent to the iOS 7-step spotlight tour.

## What's there today
- **No tour library installed** (checked `package.json`: no driver.js / intro.js / shepherd / react-joyride / reactour). PostHog + canvas-confetti only.
- **No bottom tab bar** (the iOS anchor model doesn't exist on web). The authenticated shell is **responsive with a hard split at 1024px** (`apps/web/src/components/app-shell.tsx`):
  - **Desktop ≥1024px:** fixed left **sidebar** (Record button + nav links: Home, Entries, Tasks, Goals, Insights, …) + top-right user menu.
  - **Mobile <1024px:** sticky **top nav bar** (`nav-bar.tsx`) with a subset of links + user menu; sidebar is fully hidden (not collapsed to a hamburger). Record button appears only on `/home`.
- All shell components are `"use client"` → a DOM-anchored tour library works fine.

## Step mapping (iOS 7 → web elements)
| iOS step | Web anchor (desktop) | Web anchor (mobile <1024px) |
|---|---|---|
| 1 · Record/mic | Sidebar "Record" button (`app-shell.tsx` ~L263) | Record button on `/home` (`#record`) — only present on home |
| 2 · Dashboard | Greeting/hero on `/home` (`home/page.tsx` ~L262) | same |
| 3 · Entries | Sidebar `a[href="/entries"]` | top-nav link (subset) |
| 4 · Tasks | Sidebar `a[href="/tasks"]` | top-nav link |
| 5 · Insights | Sidebar `a[href="/insights"]` | top-nav link |
| 6 · Goals | Sidebar `a[href="/goals"]` | top-nav link |
| 7 · Settings | top-right user menu (`SessionUserMenu`) | same (always present) |

**The core challenge:** desktop nav (sidebar) and mobile nav (top bar) are *different elements*, and the mobile top nav exposes only a subset of links. So a single static step list won't anchor cleanly on both. Three options (Q for Keenan below).

## Library recommendation: **driver.js**
| Option | License | Size | Fit |
|---|---|---|---|
| **driver.js** ✅ | MIT (free) | ~5KB | Framework-agnostic, CSS-selector anchoring + popovers, highlight overlay, simple step API. Best fit for "highlight existing nav elements." |
| react-joyride | MIT | ~30KB | React-native, good step/state model; heavier, more opinionated. Fine alternative if we want React-state-driven steps. |
| shepherd.js | MIT | ~40KB | Powerful, themeable; overkill here. |
| intro.js | ⚠️ **Commercial license required** for commercial use | — | Avoid — licensing cost for a paid product. |

**Recommendation: driver.js.** Lean, MIT, CSS-selector based (anchors to the existing sidebar/nav elements via `data-tour="entries"` attributes we add), no React coupling, works in the client shell. We add `data-tour="…"` attributes to the 7 anchors so selectors are stable across refactors.

## Responsive approach — needs Keenan's call
- **Option A (recommend): desktop-first, responsive anchor resolution.** One step list; each step resolves its selector based on viewport (sidebar link on desktop, top-nav link on mobile). Steps whose target is absent at the current width (e.g., a nav link not in the mobile subset) are skipped or re-pointed. Lowest effort, single flow.
- **Option B: two distinct flows** (desktop vs mobile) — cleanest UX per platform, ~2× the step-config work.
- **Option C: desktop-only initially**, defer mobile-web tour. Smallest scope; acceptable if web usage skews desktop.

## Completion + analytics (mirror iOS semantics)
- Persist completion in `UserOnboarding`/`User` (a `webTourCompletedAt`-style flag) so it fires once; gate on first authenticated `/home` visit.
- Reuse the same step copy from `packages/shared` where the concept carries over; web-specific copy where the element differs.
- Fire `trackClient` events (`web_tour_started` / `_step_viewed` / `_completed` / `_skipped`) for parity with the mobile funnel.
- Consider granting a web equivalent of `guided_start` (or not — product call).

## Rough time estimate
Assuming **Option A** (single responsive flow), driver.js, desktop + mobile-web:
- Library install + `data-tour` anchors on the 7 elements: ~0.5 day
- Step config + copy + responsive selector resolution: ~0.5 day
- Completion persistence (DB flag + gate) + analytics events: ~0.5 day
- Responsive QA (desktop + mobile-web breakpoints) + polish: ~0.5 day
- **Total: ~2 days.** Option B (two flows): +0.5–1 day. Option C (desktop-only): ~1–1.5 days.

## Open questions for Keenan (before implementation)
1. Is the sidebar/top-nav shell **stable**, or is a web nav redesign coming? (anchors depend on it)
2. **Desktop-only, or desktop + mobile-web?** (drives Option A/B/C)
3. Does the mobile top nav's **link subset** include Entries/Tasks/Insights/Goals, or only some? (affects which steps can anchor on mobile)
4. Should web tour completion grant an **achievement** like iOS's `guided_start`, or stay analytics-only?
