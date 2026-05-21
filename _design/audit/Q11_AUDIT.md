# Q11 Audit — Design Spec vs Implementation Diff

**Generated:** 2026-05-21
**Scope:** Acuity v2 visual refresh (slices Q1–Q10), entire `apps/mobile/` tree, all 11 screen specs in `_design/design_handoff_acuity_v2/`
**Read-only audit.** No code changes were made.

---

## Executive Summary

The v2 visual refresh shipped slice-by-slice against summary descriptions rather than the authoritative design files in `_design/design_handoff_acuity_v2/`. Four screens hit MATCH or near-MATCH state (Home Q4, Entry Detail Q6, Extract Review Q10's visual layer, Onboarding shell Q9). Two screens have **structural divergence from the design spec** that cannot be fixed by visual cleanup alone: **Life Matrix ships with 6 axes where the spec calls for 12**, and **Theme Map ships as a list dashboard where the spec calls for an orbital/cosmos view with 9 planets**. One screen has a **behavior divergence from the spec**: Extract Review checkboxes **default ON** in the implementation but **default OFF** in the design spec (the spec is emphatic: "Check what to keep — everything is off by default"). Onboarding step-7 shipped Q9 as a top-3 life-area ranking picker, but the design spec for that step is a 12-axis matrix baseline slider — Q9 itself called this out as "separate future product slice."

Cross-cutting: 519+ Tailwind color utilities + ~200 hardcoded hex values remain across the mobile codebase, concentrated in Goals tab (36 hex, two hardcoded `LIFE_AREAS` and `STATUS_STYLES` constants), Theme Map drill view (13 hex, zero token imports), Profile screen (47+ Tailwind classes), Insights tab `MOOD_COLORS` (6 hex), and the FAB mic button (4 hex constants inlined in `(tabs)/_layout.tsx` rather than extracted to the existing `AcuityTabBar` primitive). 84 `borderRadius` literal values bypass `tokens.radius.*`. Two design-system primitives (`MiniRadar`, `AcuityTabBar`) have zero callers.

Recommended next move: queue 5 sequential remediation slices, smallest/lowest-risk first (visual sweep), structural/behavior fixes after, and the two BLOCKER rebuilds (Life Matrix 12-axis, Theme Map orbital) last because they have backend/data implications.

---

## Step 1 — Design Source Inventory

Eleven screen `.jsx` files in `_design/design_handoff_acuity_v2/` plus supporting docs (README, CC_PROMPT, acuity-tokens, motion-gallery). Full per-screen design summaries are in the agent transcript that produced this audit; the salient structural callouts:

| Design file | Purpose | Key structural elements (NOT just styling) |
|---|---|---|
| `screen-home.jsx` (753L) | Dashboard | 108px ring + sparkbar, achievement strip with locked-state progress bars, pull-quote card, weekly insight teaser, FAB |
| `screen-recording.jsx` (267L) | Recording mid-state | Half-arc speedometer gauge, voice-reactive orb, ghost transcript with cursor, 38-bar waveform, three control buttons (Pause/Stop/Done) |
| `screen-entry.jsx` (357L) | Past entry | Pull-quote hero, quick stat grid (3 cols), AI summary card, transcript with warm-gradient highlight on beat-matched row, gradient checkbox in tasks-found list |
| `screen-entries.jsx` (259L) | Entries list | 28-day heatmap card, grouped "This week / Last week" sections, latest-entry gradient-wash card with "Latest" pill |
| `screen-tasks.jsx` (164L) | Tasks list | 3-stat strip with deltas, SegmentedTabs (Today\|Upcoming\|Done), grouped sections, gradient checkbox + 380ms spring + strike sweep, **finish-day confetti** |
| `screen-goals.jsx` (203L) | Goals list | 62px ring progress per goal (theme-hued solid, not gradient), milestone footer inset, dormant fade, AI nudge card |
| `screen-thememap.jsx` (266L) | Theme Map | **Cosmic orbital view: 9 planets across 4 concentric rings, 70 stars background, YOU pip with gradient halo, dashed connector lines, 6.0s entrance animation, glass-blur insight callout** |
| `screen-lifematrix.jsx` (336L) | Life Matrix | **12-axis radar** (Career/Health/Family/Friends/Romance/Money/Growth/Creativity/Body/Mind/Joy/Purpose), 5 concentric polygons, previous-week dashed overlay, biggest-movers list with sparklines |
| `screen-extract.jsx` (279L) | Extract review | Pull-quote summary card, 3 sections (Themes/Tasks/Goals), **all checkboxes default OFF**, sticky glass-blur footer pill with live "Keep N" counter |
| `screen-onboarding.jsx` (271L) | Onboarding step 3 of 8 | **Life Matrix baseline: one axis at a time, 88pt gradient-text big number, hue slider, mini-12-axis radar preview**, "Next axis · Romance →" gradient CTA |
| `screen-profile.jsx` (306L) | Profile / Settings | Gradient identity hero, subscription card, **Appearance card (Mode segmented + 4 Palette swatches + Haptics toggle)**, three settings groups |

Supporting docs specify the token system (oklch-based, 4 palettes, dark+light, gradients gradPrimary/gradSecondary/gradMix/heroGrad/cosmosGrad/recordGrad), the motion gallery's 6 shipping animations (voice orb, theme-map entrance, count-up, achievement bounce, task check + confetti, streak fill), and the implementation checklist (expo-blur, MaskedView for gradient text, react-native-svg, Manrope + Geist Mono, `tabular-nums` on numerics, glow sparingly).

---

## Step 2 — Implementation Inventory

Mobile screens that correspond to each design file:

| Design | Implementation file | Lines | Shipping slice | State |
|---|---|---|---|---|
| screen-home | `apps/mobile/app/(tabs)/index.tsx` | 636 | Q4 | RESTYLED ✓ |
| screen-recording | `apps/mobile/app/record.tsx` | 952 | Q5 | PARTIAL RESTYLE |
| screen-entry | `apps/mobile/app/entry/[id].tsx` | 667 | Q6 + Q10 | RESTYLED ✓ |
| screen-entries | `apps/mobile/app/(tabs)/entries.tsx` | 455 | Q8 | PARTIAL RESTYLE |
| screen-tasks | `apps/mobile/app/(tabs)/tasks.tsx` | 860 | Q8 | PARTIAL RESTYLE |
| screen-goals | `apps/mobile/app/(tabs)/goals.tsx` | 1380 | Q8 | DRIFT (largest) |
| screen-thememap | `apps/mobile/app/insights/theme-map.tsx` | 239 | (none) | DRIFT + structural MISSING |
| screen-lifematrix | `apps/mobile/components/life-map-radar.tsx` | 382 | Q7 | RESTYLED ONLY (6 axes vs 12) |
| screen-extract | `apps/mobile/components/extraction-review.tsx` | 573 | Q10 | RESTYLED with **behavior gap** (default state) |
| screen-onboarding | `apps/mobile/components/onboarding/step-7-life-areas.tsx` | 251 | Q9 | RESTYLED ONLY (wrong screen — top-3 picker vs 12-axis baseline) |
| screen-profile | `apps/mobile/app/(tabs)/profile.tsx` | 492 | (none, Q2 partial) | DRIFT (NativeWind Tailwind, not v2) |

---

## Step 3 — Diff Table

| Design screen | Implementation | Status | Severity | Gap description |
|---|---|---|---|---|
| **screen-home** | `app/(tabs)/index.tsx` | **MATCH** | LOW | Token adoption complete. Motion #3 (count-up) and #6 (streak +1 floater) ship; achievement strip status not directly verified in this audit — flag for sim spot check. |
| **screen-recording** | `app/record.tsx` | **PARTIAL** | MEDIUM | 3 hex remain. Subcomponents `RecordOrb`, `RecordWaveform`, `SpeedometerGauge`, `ProcessingProgressBar` not fully token-ified. Recording flow itself works; cosmetic polish only. |
| **screen-entry** | `app/entry/[id].tsx` | **MATCH** | LOW | Q6 + Q10 cover this surface. Token adoption complete via composed primitives. |
| **screen-entries** | `app/(tabs)/entries.tsx` | **DRIFT** | HIGH | 11 hex hits. Heatmap-28 component does not import v2 primitives. Search/filter UI hardcoded. Spec calls out "Latest" pill with gradient-wash card variant — verification needed. Primary tab → user-visible. |
| **screen-tasks** | `app/(tabs)/tasks.tsx` | **PARTIAL** | HIGH | 10 hex + 3 rgba. GradientCheckbox adopted but PRIORITY_COLOR constant hardcoded; tab indicator (Today/Upcoming/Done) status colors hardcoded. Finish-day confetti and task-check motions ship. |
| **screen-goals** | `app/(tabs)/goals.tsx` | **DRIFT** | HIGH | **36 hex hits — largest hardcoded surface.** `LIFE_AREAS` constant (lines 252-259) hardcodes 6 area colors. `STATUS_STYLES` constant (lines 261-267) hardcodes 5 status colors. `area.color` references at lines 863-865 still use the legacy palette. Primary tab. |
| **screen-thememap** | `app/insights/theme-map.tsx` | **DRIFT + structurally MISSING** | **BLOCKER** | Drill view is a list/dashboard layout with 13 hex + 3 rgba + zero `useTheme()` import. Design spec is an **orbital cosmic view**: 9 planets across 4 concentric ring guides, 70 stars background, YOU pip with gradient halo + dashed connector lines, 6.0s solar-system entrance animation, glass-blur insight callout. Current implementation is unrelated visually and structurally. |
| **screen-lifematrix** | `components/life-map-radar.tsx` | **RESTYLED ONLY** | **BLOCKER** | Renders 6 axes from `DEFAULT_LIFE_AREAS` (`packages/shared/src/constants.ts:123`). Design spec calls for **12 axes**: Career, Health, Family, Friends, Romance, Money, Growth, Creativity, Body, Mind, Joy, Purpose. Also missing previous-week dashed overlay polygon, hue-colored score dots that flip mint/red on delta, and "Biggest moves" sparkline list. Component supports `gradientColors` prop but Insights tab doesn't pass one, so it renders in hardcoded violet defaults. |
| **screen-extract** | `components/extraction-review.tsx` | **RESTYLED with BEHAVIOR GAP** | **BLOCKER** | Visual refresh shipped Q10. **But the design spec is emphatic on default state — all checkboxes default OFF, copy "Check what to keep, everything is off by default."** Current implementation (line 59-62) defaults `selected: true` for tasks and `selected: !alreadyExists` for goals. This is a substantive product behavior divergence, not visual. |
| **screen-onboarding** | `components/onboarding/step-7-life-areas.tsx` | **RESTYLED ONLY (wrong screen)** | **BLOCKER** | Q9 refreshed the top-3 life-area ranking picker. **Design spec for the same slot is a 12-axis Life Matrix baseline step**: one axis at a time, 88pt gradient-text big number, hue slider, mini-12-axis radar preview, "Next axis · Romance →" CTA, advances through all 12 axes. Q9 itself flagged this: "Building a true 12-axis input is a future product slice, not visual refresh." Worth confirming whether the top-3 picker is replaced by the 12-axis step or whether both screens coexist. |
| **screen-profile** | `app/(tabs)/profile.tsx` | **DRIFT** | HIGH | Out-of-scope of Q1–Q10. 47+ Tailwind utility classes (`bg-violet-600/20`, `border-violet-600/40`, `text-zinc-50` etc.) drive the entire UI. Avatar is inlined not shared. Tier badge inlined with conditional Tailwind, doesn't reuse the existing `TierPill` primitive. Appearance card (Mode + Palette + Haptics) — Q2 shipped this but it's in a separate component (`appearance/appearance-card.tsx`); the rest of the screen never got the v2 treatment. |

---

## Step 4 — Cross-Cutting Audit

### 4.1 Hardcoded color references — top 20 files

(Excluding `lib/theme/tokens.ts`, intentional pure white/black, and template-string token concatenations.)

| Rank | File | Hex | Notes |
|---|---|---|---|
| 1 | `components/acuity/ThemePill.tsx` | 36 | Canonical theme palette per design — these are **data colors** for theme identity, intentional |
| 2 | `app/(tabs)/goals.tsx` | 36 | `LIFE_AREAS` + `STATUS_STYLES` constants — **in scope, must fix** |
| 3 | `app/(tabs)/insights.tsx` | 27 | `MOOD_COLORS` (GREAT/GOOD/NEUTRAL/BAD) — **in scope, must fix** |
| 4 | `components/theme-map/ThemeRings.tsx` | 22 | Sentiment-band ring colors — **in scope, must fix** |
| 5 | `components/theme-map/theme-tokens.ts` | 17 | Theme-map local palette — **in scope** |
| 6 | `app/task/[id].tsx` | 17 | Detail screen — **in scope** |
| 7 | `app/goal/[id].tsx` | 17 | Detail screen — **in scope** |
| 8 | `components/theme-map/LockedState.tsx` | 16 | Locked card — **in scope** |
| 9 | `components/delete-account-modal.tsx` | 15 | Modal — **in scope** |
| 10 | `app/paywall.tsx` | 14 | Paywall — **in scope** |
| 11 | `app/(auth)/sign-in.tsx` | 14 | Auth — **in scope** |
| 12 | `app/(tabs)/entries.tsx` | 11 | Entries tab — **in scope** |
| 13 | `app/(tabs)/_layout.tsx` | 11 | **FAB mic button constants (BRAND_PURPLE etc.) — must fix; affects every tab** |
| 14 | `app/subscribe.tsx` | 10 | Subscribe flow |
| 15 | `app/dimension/[key].tsx` | 10 | Dimension detail |
| 16 | `app/(tabs)/tasks.tsx` | 10 | Tasks tab |
| 17 | `app/insights/state-of-me.tsx` | 9 | State of me |
| 18 | `app/insights/ask.tsx` | 9 | Ask insights |
| 19 | `app/(auth)/sign-up.tsx` | 9 | Auth |
| 20 | `components/user-insights-card.tsx` | 8 | Insight card |

**Tailwind utility class hotspots (top patterns):** `bg-violet-600` (45×), `text-violet-400` (23×), `bg-zinc-50` (19×), `bg-violet-950` (13×), `text-violet-600` (11×), `border-violet-500` (11×), `bg-zinc-100` (11×). Concentrated in Profile screen, auth screens, and onboarding steps 1-6, 8-10 (which inherit the Q9 shell but still have their own inner Tailwind chrome).

**rgba() function calls:** 128 total. Concentrated in `theme-map` components for blend overlays and in `goals.tsx` for `area.color + "20"` tints.

### 4.2 Shared vs duplicated components

| Component | Location | Status | Issue |
|---|---|---|---|
| **FAB mic button** | `app/(tabs)/_layout.tsx:38-302` inlined | **NOT SHARED** | Four hardcoded constants (`BRAND_PURPLE`, `BRAND_PURPLE_DARK`, `RECORD_FILL_ACTIVE`, `RECORD_FILL_INACTIVE`) + hardcoded shadow color `#7C3AED` at line 278. `AcuityTabBar` primitive exists at `components/acuity/AcuityTabBar.tsx` with zero callers. The tab layout reinvents the tab bar instead of using the primitive. |
| **Avatar / initials** | `app/(tabs)/profile.tsx:166-183` inlined | **NOT SHARED** | Uses className violet-600 hardcoded. No `Avatar` primitive in `components/acuity/`. Only one usage today but design uses an identical 64px gradient avatar in the Profile identity hero (and a 44px variant in Home greeting). |
| **Tier pill** (Free/Pro/Trial) | `components/acuity/TierPill.tsx` — 6 callers | SHARED ✓ | Primitive used in identity-hero, today-stats-row, weekly-insight-card, and extract review. **But:** Profile screen at lines 190-195 reinvents a tier badge inline with conditional Tailwind className instead of using `TierPill`. |

### 4.3 Typography drift

Minimal. Single confirmed offender: `components/appearance/appearance-card.tsx` uses `fontFamily: "System"` literal. Otherwise, v2-refreshed surfaces consistently use `tokens.fontSans`, `tokens.fontMono`, `tokens.fontDisplay`. Legacy surfaces (Profile, auth, older onboarding steps) inherit system default by omission. Standardizing on `tokens.fontSans` as default and opt-in for `fontDisplay` / `fontMono` would close this.

### 4.4 Spacing / radius drift

**84 hardcoded `borderRadius` literals** across the codebase that should reference `tokens.radius.{xs|sm|md|lg|xl|pill}`. Highest density:

| File | Hardcoded `borderRadius` count |
|---|---|
| `components/delete-account-modal.tsx` | 7 |
| `components/theme-detail/InsightCard.tsx` | 6 |
| `components/theme-map/ThemeDetailSheet.tsx` | 6 |
| `components/theme-map/ThemeMapDashboard.tsx` | 5 |
| `components/theme-map/ThemeRings.tsx` | 4 |
| `components/theme-map/LockedState.tsx` | 4 |
| `components/extraction-review.tsx` | 3 |
| `components/onboarding/shell.tsx` | 3 |

Spacing (`padding`, `margin`, `gap`) is consistently hardcoded everywhere. The design system does not currently expose `tokens.spacing.*` (radius tokens exist; spacing tokens do not). Introducing a spacing scale would be a small token addition that unlocks a sweep.

### 4.5 v2 primitive coverage

| Primitive | Import count | Adoption |
|---|---|---|
| `GradientText` | 16 | mature |
| `HeroCard` | 15 | mature |
| `GlassPill` | 13 | mature |
| `ThemePill` | 12 | mature |
| `GradientCheckbox` | 9 | good |
| `TierPill` | 6 | should expand to Profile + others |
| `RingProgress` | 6 | only Home dashboard — should appear in goal completion rings, streaks, dimension detail |
| `SegmentedTabs` | 3 | only Insights tab — should expand to Tasks (Today/Upcoming/Done), Goals (Active/Done/Dormant), Profile sub-screens |
| `Sparkbar` | 3 | minimal usage |
| `MiniRadar` | **0** | **NOT ADOPTED** — primitive exists, zero callers |
| `AcuityTabBar` | **0** | **NOT ADOPTED** — primitive exists, tab bar reinvented in `(tabs)/_layout.tsx` |

### 4.6 Known Q1–Q10 divergences beyond what slices flagged

| Slice | What it claimed | Newly-identified divergence |
|---|---|---|
| Q5 Recording | Voice-reactive orb, speedometer, waveform | Subcomponents not token-ified; `ProcessingProgressBar` hardcoded |
| Q7 Insights | SegmentedTabs swap, entrance animation, BiggestMoves component | `MOOD_COLORS` constant in `insights.tsx:98-103` hardcoded; `LifeMapRadar` rendered with default hardcoded palette (caller doesn't pass `gradientColors`); spec wants 12 axes, ships 6 |
| Q8 Entries/Tasks/Goals | 28-night heatmap, GradientCheckbox swap, finish-day confetti | Goals `LIFE_AREAS` + `STATUS_STYLES` constants hardcoded; Tasks `PRIORITY_COLOR` hardcoded; Entries heatmap doesn't import primitives |
| Q9 Onboarding | Visual refresh of life-areas step + shell | **The step itself is the wrong design — spec is a 12-axis baseline slider, not a top-3 picker.** Q9 explicitly deferred this. |
| Q10 Extract review | HeroCard wrap, GradientCheckbox, type pills, gradient CTA | **Checkbox default state is opposite of spec.** Implementation defaults tasks to `selected: true`; spec defaults all to `selected: false` with copy "Check what to keep". |

User-reported issue not directly observed in this audit but flagged as a verification item: **"Segmented tabs are overflowing the screen."** Affected screens unknown without simulator inspection.

---

## Step 5 — Recommended Remediation Plan

Five phases, ordered by risk and dependency. Each is a separate slice with its own approval gate.

### Phase A — Visual sweep (comprehensive pass)

**Scope:** Token-ify all hardcoded colors, borderRadius, Tailwind utility classes that are pure-visual. Replace `LIFE_AREAS` and `STATUS_STYLES` constants in goals.tsx with token derivations. Replace `MOOD_COLORS` in insights.tsx with token derivations or move to `@acuity/shared` if cross-platform. Extract `FAB mic button` to use the `AcuityTabBar` primitive. Extract `Avatar` primitive. Convert Profile screen Tailwind className → inline style with tokens. Convert auth screens. Convert Theme Map drill view to use tokens (without rebuilding its structure — that's Phase D).

**Files touched:** ~50-60, ~700-1000 line changes. Likely 4-6 commits to keep individual diffs reviewable.

**Complexity:** MEDIUM (many files, repetitive substitutions, but no logic changes).
**Risk:** MEDIUM (layout drift risk from removing className utilities that bundled spacing + color; `className="bg-violet-600 px-4 py-2"` → style needs careful spacing extraction).
**Unlocks:** Subsequent phases — fewer hardcoded colors means less chance Phase D/E accidentally inherit drift.
**Suggested sequencing inside Phase A:**
1. FAB mic button + `AcuityTabBar` integration (1 file, high-visibility).
2. Goals tab `LIFE_AREAS` + `STATUS_STYLES` constants (1 file, highest hex count).
3. Insights `MOOD_COLORS` + LifeMapRadar `gradientColors` pass-through (2 files).
4. Profile screen + Avatar primitive extraction (2-3 files).
5. Auth screens (3 files: sign-in, sign-up, forgot-password).
6. Theme Map sub-components (visual only, not orbital rebuild) (5-7 files).
7. Modal + detail screen sweep (delete-account-modal, task/[id], goal/[id], dimension/[key], paywall, subscribe, etc.).

### Phase B — Extract review default-state fix

**Scope:** Change `extraction-review.tsx` lines 89-91 from `selected: true` (tasks) and `selected: !g.alreadyExists` (goals) to `selected: false` for both. Update any copy that relied on the opposite default (e.g., Commit button label currently shows `(N)` based on selectedCount > 0; verify it still works with default-zero). Possibly rename "Skip all" copy since "all are already off" changes the meaning.

**Files touched:** 1 (`extraction-review.tsx`).
**Complexity:** LOW (~2-line change).
**Risk:** MEDIUM (substantive user-experience behavior change — current users have learned the "tap to deselect" pattern; switching to "tap to select" is correct per spec but is a behavioral inversion).
**Unlocks:** Alignment with design spec. Also: design spec says default state is the **product decision** that gives Acuity its "you choose what matters" voice — not just a UI default.
**Sequencing:** Can ship independently. Recommend a Linear ticket noting the UX shift so support/onboarding/sales materials reflect the new model.

### Phase C — Onboarding Life Matrix baseline step

**Scope:** Build a new onboarding step matching `screen-onboarding.jsx`: one axis at a time, 88pt gradient-text big number, hue slider, mini-12-axis radar preview, "Next axis · Romance →" CTA. Cycles through all 12 axes. Submits scores per axis to `/api/onboarding/update` (new payload shape; coordinate with backend or extend `lifeAreaPriorities` shape to optionally carry score-per-axis).

**Files touched:** 1 new step file (~250-400 lines), `components/onboarding/index.tsx` to register the step, possibly `shell.tsx` if step ordering changes. Optional: a new `Step12LifeMatrix` component plus a refactor of step-7 (replace or coexist).

**Complexity:** MEDIUM-HIGH (new screen with substantive interaction state — slider, axis carousel, mini-radar preview).
**Risk:** MEDIUM (touches onboarding flow which Jim has flagged as MEDIUM/HIGH RISK; live build-42 onboarding is pinned, so this affects future builds only).
**Open product question:** Does this new step **replace** step-7 (the top-3 ranking picker that Q9 just refreshed) or **coexist** as a separate step? Spec language treats the matrix as "step 3 of 8" suggesting it might replace step-7 entirely. Confirm with product before building.
**Sequencing:** Should follow Phase A (so the new step inherits clean visual chrome) and Phase D (so the 12-axis data shape is settled).

### Phase D — Life Matrix 12-axis expansion

**Scope:** Expand `DEFAULT_LIFE_AREAS` in `packages/shared/src/constants.ts` from 6 to 12 axes. Coordinate with backend: extraction pipeline (`apps/web/src/lib/pipeline.ts` and `apps/web/src/lib/memory.ts`) scores life areas based on this constant. New axes need extraction prompt updates, scoring backfill for existing users, and `LifeMapArea` table backfill (new rows for each of the 6 new areas per user). Update `LifeMapRadar` component to render 12 axes (it already supports parametric axis count — verify). Update Insights tab caller to pass `gradientColors`.

**Files touched:** `packages/shared/src/constants.ts`, extraction lib, memory lib, `LifeMapRadar`, `insights.tsx`, possibly Inngest functions, possibly mobile callers that read life-area data.

**Complexity:** HIGH (cross-stack — shared constant + extraction prompts + DB backfill + mobile).
**Risk:** HIGH (changes the data shape consumed by live build-42 binary; if extraction prompts produce 12-axis scores but live build-42's `RadarArea[]` only knows 6, the radar mis-renders or drops axes). Coordinate with the live-binary contract — likely need to keep the 6 as a stable subset for build-42 and surface the additional 6 only in build-43+.
**Unlocks:** Phase E (the onboarding baseline depends on which 12 axes exist).
**Sequencing:** This is the hardest one. Should run before Phase E.

### Phase E — Theme Map orbital cosmos rebuild

**Scope:** Replace `apps/mobile/app/insights/theme-map.tsx` (currently a list/dashboard) with the orbital cosmos view from `screen-thememap.jsx`: 9 planets across 4 concentric ring guides, cosmos background gradient, 70 stars overlay, YOU pip with gradient halo, dashed connector lines, 6.0s solar-system entrance (motion #2: easeOutCubic, stagger 300ms per ring inner-to-outer, planets drift from 1.45× → 1.0× radius with -1 revolution spin, fade-in at ~30% of local duration, first focus per session only).

**Files touched:** `app/insights/theme-map.tsx` rewrite + new sub-components (planet, orbital-ring, insight-callout, cosmos-bg). ~400-600 lines new code.

**Complexity:** HIGH (new screen with substantive SVG + animation work).
**Risk:** LOW-MEDIUM (one new file, doesn't touch other surfaces; existing dashboard is gated behind 10-entry unlock so users with fewer entries don't see either version).
**Unlocks:** Closes the last BLOCKER. Theme Map becomes the design's intended ceremonial visual.
**Sequencing:** Can run in parallel with Phase A but is its own slice. Should come after Phase D so the planet hues align with the canonical theme palette.

### Phase Summary Table

| Phase | Title | Complexity | Risk | Touches | Suggested order |
|---|---|---|---|---|---|
| A | Visual sweep (color + Tailwind + radius + FAB + Avatar) | MEDIUM | MEDIUM | ~50 files | 1st (foundation) |
| B | Extract default-OFF behavior | LOW | MEDIUM (UX shift) | 1 file | 2nd (small, isolated) |
| C | Onboarding 12-axis baseline step | MEDIUM-HIGH | MEDIUM | 2-3 files + product call | 4th (after D settles axes) |
| D | Life Matrix 12-axis expansion | HIGH | HIGH (cross-stack) | shared/web/mobile | 3rd (unblocks C + E) |
| E | Theme Map orbital cosmos rebuild | HIGH | LOW-MEDIUM | 1 file rewrite | 5th (last, leverages clean tokens) |

---

## Ambiguous cases for human decision

Before starting any remediation, three product/architecture questions need explicit answers:

1. **Phase B behavior inversion** — confirm that switching extract-review checkboxes to default OFF (per spec) is the right product call. Current users have built muscle memory around the opposite default. This is more than a "fix"; it's a UX repositioning ("Acuity asks you to choose, not nags you to opt out").

2. **Phase C step-7 vs step-3** — confirm whether the new 12-axis baseline step **replaces** the current top-3 life-area ranking picker (Q9-refreshed step-7) or **coexists** alongside it. The design spec frames the matrix step as "Life Matrix · 4 of 12" (step 3 of 8 overall onboarding) which suggests replacement.

3. **Phase D backward compatibility** — confirm whether the 12 new axes need to be readable by live build-42 binary or whether they're build-43+ only. If the live binary needs to keep reading 6-axis data, the schema needs a wire-compatible expansion strategy (e.g., keep the original 6 enum values as a subset; add the new 6 as additional values).

The five intentional/in-spec **NOT** changes (carried over from prior slices' notes):

- Confetti hardcoded warm accents (`#f59e0b`, `#ef4444`) in `components/tasks/confetti.tsx` — intentional per Q8 spec ("fixed warm accents that pop against any palette").
- Pure white/black hex codes on gradient surfaces (text on gradient buttons, shadows in `tokens.ts`) — intentional per the spec's exception clause.
- `StatusBar style="light"` / `style="dark"` — named system styles, not hex; out of scope.
- `ActivityIndicator color="#FFFFFF"` on gradient surfaces — intentional white-on-gradient.
- `DEFAULT_LIFE_AREAS` *data* hex codes in `packages/shared/src/constants.ts` — these are theme-identity colors used by other consumers (web Theme Map). Keep as data; just don't use them for surface colors on mobile.

---

## Output files

- **This report:** `_design/audit/Q11_AUDIT.md`
- **Machine-readable diff:** `_design/audit/Q11_DIFF.json`

Both committed in the same docs-only commit. Jim reviews, then we queue Phase A as Q12 (or wherever it lands in the slice schedule).
