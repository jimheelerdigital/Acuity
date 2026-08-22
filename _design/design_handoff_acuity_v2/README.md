# Handoff: Acuity Visual Refresh (v2)

## Overview

Complete visual refresh for **Acuity** — a nightly voice-journaling iOS app (Expo/React Native + Next.js + Supabase). Same flows, same structure, dramatically elevated execution: from a "web app in a phone frame" to a premium-feeling iOS app with deliberate type, refined surfaces, restrained motion, and gamification cues that don't tip into kitsch.

This bundle includes hi-fi mockups of **11 screens × dark+light modes** (22 artboards total).

## About the Design Files

The files in this bundle are **design references created in HTML/CSS/JSX** — prototypes showing intended look, layout, hierarchy, and behavior. They are **not production code to drop in.** Your task is to recreate them in the existing **Expo/React Native** codebase (and, where the screen has a web counterpart, in the **Next.js** companion at acuity.io) using the project's established patterns, libraries, and component conventions.

Open `index.html` in a browser to view the design canvas: pan/zoom to navigate, click any artboard's expand icon to view it fullscreen, then use ←/→ to step through. The Tweaks panel (bottom-right) toggles palette + chroma boost.

## Fidelity

**High-fidelity.** Colors, typography, spacing, gradients, radii, and motion are all final. Recreate pixel-perfectly using the codebase's existing libraries and patterns. Where RN doesn't natively support a CSS feature (e.g., `backdrop-filter`, CSS gradients-as-text-fill), use the closest RN equivalent — `expo-blur`, `react-native-linear-gradient`, etc. Notes below where this applies.

## Direction Picked

After exploring an editorial direction (archived under `v1-editorial-archive/` for reference, not for implementation), the picked direction is:

- **Dopamine modern-tech.** Sleek, soft, "almost gamified."
- **Dark-mode primary**, light-mode as the companion (both required to feel native).
- **Coral × violet duo accent** with mint for positive deltas and warm-red for danger/stop.
- **Manrope** as the display family (rounded, modern), **SF Pro Text** for body, **Geist Mono** for numerals.
- Glow used sparingly, reserved for: mic FAB, recording orb, primary CTAs.

## Design Tokens

### Color (oklch values, parameterized by accent + mode)

Stored in `acuity-tokens.jsx → makeAcuityTokens()`. The function takes `{ dark, accent, boost }` and returns a token object. **Recommendation:** port this to a `tokens.ts` consumed by your themeing layer.

#### Accent presets (warm primary × cool secondary)

| Preset | Primary (oklch) | Secondary (oklch) | Use |
|---|---|---|---|
| **coral** ✅ default | `0.76 0.155 38` | `0.66 0.18 285` | Picked direction |
| sunset | `0.73 0.165 18` | `0.62 0.20 330` | Alt — warmer |
| citrus | `0.80 0.155 70` | `0.68 0.165 195` | Alt — cooler-warm |
| cobalt | `0.66 0.18 255` | `0.78 0.13 85` | Alt — cool-led |

The `boost` slider (0.75 → 1.25) scales chroma. Production default: `1`.

#### Page surfaces (dark mode)

| Token | Value | Notes |
|---|---|---|
| `bg` | `oklch(0.21 0.022 hue+5)` | Lifted off black — warm-undertone charcoal |
| `bgSub` | `oklch(0.235 0.024 hue+5)` | |
| `bgInset` | `oklch(0.185 0.020 hue)` | For nested wells |
| `cardBg` | `oklch(0.245 0.024 hue+5)` | |
| `cardBgTint` | `oklch(0.255 0.034 ph+5)` | Hue-tinted card |
| `cardBgRaised` | `oklch(0.27 0.028 sh+5)` | |

#### Page surfaces (light mode)

| Token | Value |
|---|---|
| `bg` | `oklch(0.975 0.005 sh)` |
| `bgSub` | `oklch(0.96 0.007 sh)` |
| `cardBg` | `oklch(1 0 0)` |
| `cardBgTint` | `oklch(0.965 0.012 ph)` |

#### Text

| Token | Dark | Light |
|---|---|---|
| `text` | `oklch(0.98 0.004 sh)` | `oklch(0.14 0.012 sh)` |
| `textSec` | `oklch(0.74 0.010 sh)` | `oklch(0.42 0.010 sh)` |
| `textTer` | `oklch(0.56 0.012 sh)` | `oklch(0.58 0.012 sh)` |
| `textQuiet` | `oklch(0.40 0.008 sh)` | `oklch(0.74 0.008 sh)` |

#### Hairlines

| Token | Dark | Light |
|---|---|---|
| `line` | `oklch(1 0 0 / 0.07)` | `oklch(0 0 0 / 0.06)` |
| `lineStrong` | `oklch(1 0 0 / 0.13)` | `oklch(0 0 0 / 0.10)` |

#### Status colors

| Token | Value | Soft variant |
|---|---|---|
| `good` (mint, positive deltas) | `oklch(0.74 0.135 165)` | same hue at `/ 0.18` |
| `bad` (red, danger/stop) | `oklch(0.66 0.17 25)` | same hue at `/ 0.18` |

### Gradients

| Token | Composition | Use |
|---|---|---|
| `gradPrimary` | `linear-gradient(135deg, primaryHi, primary, primaryLo)` | Warm CTAs, streak tile icon |
| `gradSecondary` | `linear-gradient(135deg, secHi, sec, secLo)` | Cool accents, themes tile icon |
| `gradMix` | `linear-gradient(135deg, primary, secondary)` | Avatar, tier pill text, theme dots, FAB |
| `gradMixSoft` | low-alpha gradMix | Subtle backgrounds |
| `heroGrad` | Two radial blobs + linear bg | Top of most screens |
| `cosmosGrad` | Radial dark-to-darker | Theme Map background |
| `recordGrad` | Radial primary glow | Recording screen background |

### Typography

| Family | Stack | Use |
|---|---|---|
| `display` | Manrope, then -apple-system | Large stats, titles, hero numbers |
| `sans` | -apple-system → SF Pro Text → system-ui | Body, UI, labels |
| `mono` | Geist Mono → SF Mono → ui-monospace | Numerals, timestamps, eyebrow labels |

**Scale (committed values, iOS HIG compliant — 17pt body floor with character):**

| Style | Family | Size | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|---|
| Eyebrow / overline | mono | 10–11 | 700 | 1.4 | 1.2 |
| Body (floor) | sans | 15–17 | 400–500 | -0.2 | 1.35–1.5 |
| Body strong | sans | 15 | 600 | -0.2 | 1.3 |
| Label | sans | 13 | 600 | -0.1 | 1.3 |
| Display S | display | 17–20 | 700 | -0.3 | 1.1 |
| Display M | display | 22–28 | 700 | -0.6 | 1.05 |
| Display L | display | 30–36 | 700–800 | -0.8 / -1.4 | 1 |
| Display XL | display | 44–88 | 800 | -1.6 to -3.0 | 1 |

**Numerals:** always `fontVariantNumeric: 'tabular-nums'` (or RN: `fontVariant: ['tabular-nums']`) for stats so they don't jitter.

### Radii

```
xs: 10   sm: 14   md: 18   lg: 22   xl: 28   pill: 999
```

Conventions:
- Cards: 22–28
- Tiles / list groups: 18–22
- Pills, buttons: 999
- Inline tags: 999 (small)
- Setting-row icon containers: 8

### Shadows

| Token | Dark | Light |
|---|---|---|
| `shadowSoft` | `inset 0 1px 0 oklch(1/0.04), 0 8px 22px oklch(0/0.28)` | `0 1px 2px oklch(0/0.04), 0 10px 24px oklch(0/0.05)` |
| `shadowLift` | `inset 0 1px 0 oklch(1/0.06), 0 14px 36px oklch(0/0.34)` | `0 2px 6px oklch(0/0.05), 0 18px 44px oklch(0/0.08)` |
| `glowPrimary` | `0 0 16px primary/0.30, 0 8px 18px primaryLo/0.22` | same | _Use sparingly_ |
| `glowSecondary` | parallel | parallel | _Use sparingly_ |
| `glowSoft` | `0 6px 18px primary*0.7 / 0.18` | same | |

**Glow rule:** reserve real glow for mic FAB, recording orb, Tonight CTA, Done button. Everything else uses `shadowSoft` or `shadowLift`. Adding glow to every gradient surface was the first wrong turn — don't do it.

### Texture (the "grain")

Dark surfaces use a low-opacity SVG turbulence overlay (data-URI in `tokens.grain`) at `mix-blend-mode: overlay`. In RN, replicate with `react-native-noise` or a small repeating noise PNG at ~10% opacity on dark backgrounds. Without it the bg reads as flat black — that's the regression we corrected.

### Motion

| Token | Value | Use |
|---|---|---|
| `easeStandard` | `cubic-bezier(.32, .72, 0, 1)` | All standard transitions |
| `easeEnter` | `cubic-bezier(.16, .9, .3, 1)` | New element appearances |
| `durBase` | 280ms | Tabs, sheets, toggles |
| `durSlow` | 340ms | Page transitions, hero state changes |

Specific behaviors documented per screen below.

## Screens (in source order)

### 01 · Home (Dashboard variant) — `screen-home.jsx → HomeDashboard`

**Primary direction.** Stat-heavy, gamified.

**Layout (top to bottom):**

1. **Top bar** — avatar (44px gradient circle with initial), greeting ("Good morning,") + name (display 20/700), **Tier pill** ("Lv 4 · Reflective" with gradient level number).
2. **Hero Life Matrix card** (radius 28) with corner glow blob:
   - 108px ring progress with score (display 36/800), "OVERALL" eyebrow
   - Right: "Life Matrix" eyebrow, headline ("Climbing this week."), two delta pills: `+5 wk` (mint) and `+12 / 30d` (neutral)
   - Below: 7-day sparkbar of entries with "32 / this week" trailing total
3. **Gamified stat tiles** (2-col grid, radius 22):
   - **Streak** — flame icon, "Streak / longest: 22", big number "14 nights", **tier progress bar** ("Lv 4 · Reflective · 14/21 · 7 more for Devoted")
   - **Themes (On your mind)** — sparkle icon, big number "7 themes", stacked theme-color dot avatars + "Career, Family, Health…"
4. **Achievement strip** — horizontal scroll of 6 medallions:
   - Unlocked: bright gradient icon + label + timestamp ("JUST NOW" / "2mo" / "6w" / "7w")
   - Locked: greyed icon + label + "LOCKED · 66%" with progress bar
5. **Last night card** (radius 24) — eyebrow pill, duration, **pull-quote** in display 17/500 with curly quotes, summary, theme pills
6. **Surfaced today** (list group radius 22) — checkbox-style rows with task text + theme tag
7. **Weekly insight teaser** (radius 24, secondary-gradient hero block) — sparkle icon + "Pro" pill + preview text + "Unwraps Sun, 8am"
8. **Floating bottom tab bar** with center mic FAB (gradient + glow)

**Interactions:**
- Tap hero → drills to Insights/Matrix
- Tap any stat tile → drills to its detail
- Horizontal swipe on achievement strip
- Tap weekly insight → opens Weekly Insight delivery (separate design — not in this bundle)
- Tap mic FAB → starts recording flow

### 01b · Home (Ritual variant) — `HomeRitual`

**Light-mode companion direction.** Quieter, hero-quote-forward.

Same data; different grammar:
- Greeting headline with name in gradient text
- Streak as a single ribbon pill ("14 nights in a row · Your longest streak yet")
- Hero pull-quote in display 26/500
- Stat strip (3 mini-stats divided by hairlines)
- Big full-width "Tonight's entry" CTA with gradient + glow

Use Ritual for light mode if you want the two modes to feel like complementary moments (calm morning vs. evening drive).

### 02 · Entry Detail — `screen-entry.jsx`

Past recording with extracted summary, themes, tasks, transcript.

**Layout:**
1. Floating glass back/share/more buttons
2. Header: eyebrow pill ("ENTRY 41"), title (display 32/700 "Tuesday Night"), meta row (date · time · duration)
3. **Quick-stat grid** — 3 tiles, each with big gradient-text number + label (Themes 4 / Tasks 3 / Tense 58)
4. **Pull-quote hero card** (radius 26) — gradient bg, oversized decorative `"` glyph top-right, eyebrow "PULL QUOTE · 00:38", quote in display 22/500
5. **Themes** — section head "Themes 4" + horizontal pill row
6. **AI summary** — tinted card with gradient icon, "AI SUMMARY" eyebrow, paragraph
7. **Tasks found** (list group) — gradient-checkbox rows with theme tags
8. **Goal touched** — single row with progress bar
9. **Transcript** — list group with timestamps. **The matching beat to the pull-quote is highlighted** with a left-aligned warm gradient wash + bold weight + primary-color timestamp.

### 03 · Recording — `screen-recording.jsx`

Mid-record state, 23 seconds in.

**Layout:**
1. Top bar: glass "Cancel" pill (left), glass "● REC" indicator with pulsing red dot (right)
2. Prompt: "TONIGHT'S PROMPT" eyebrow + serif-feeling display question
3. **Speedometer gauge** — top arc that cups the orb:
   - Background dotted track, 19 tick marks radiating outward (active ticks colored primary)
   - Gradient fill arc (primary → secondary) with soft glow + crisp stroke pair
   - White circle "progress head" at current position
   - `0:00` / `1:30` labels below endpoints
4. **Center orb** — radial gradient sphere, pulse halo, inset highlights
5. **Timer** — display 44/700 "0:23" below orb
6. **Ghost transcript** — fade-up text revealing what was just said, with the latest token in full opacity + a blinking primary cursor `|`
7. **Waveform** — 38 vertical bars with bell-curve heights, animating via `animation: acuity-wave 1.Xs ease-in-out alternate infinite` (per-bar delay/speed)
8. **Controls** — Pause (glass), Stop (large warm-red orb with white square inside), Done (gradient pill with glow)

**Motion:**
- Concentric ring pulses behind orb (3 rings, 4–6s soft pulse, staggered)
- Orb halo pulses 2.6s
- REC dot pulses 1.4s
- Waveform bars stagger 0.1s, vary 1.1–1.9s duration

### 04 · Theme Map (Insights tab) — `screen-thememap.jsx`

Cosmic orbital view; planets sized by frequency.

**Layout:**
1. Top bar: back / center title block ("INSIGHTS / Theme Map") / more
2. **Segmented tabs**: "Theme Map | Matrix | Trends" — active uses `gradMix` + white text
3. Title block: eyebrow "What you think about", display 28 "**9** active themes" (number in gradient), subtitle "41 entries · last 60 days"
4. **Orbital canvas** (380px tall, marginTop 32 for breathing room):
   - 4 concentric rings (62/108/152/188px radii) — innermost solid, outer 3 dashed
   - Center "YOU" pip with primary color + outer halo ring
   - Dashed thin connector lines from center to each planet
   - **9 planets** (label / count below each), positioned by `ring` + `angle`
   - Planet styling: radial gradient sphere with inset highlights, soft drop-shadow glow
5. **Insight callout** at bottom — glass-blur card with gradient sparkle icon, headline + sub, chevron

**Planet data (don't change angles arbitrarily — they're tuned to avoid title spill):**

| Theme | Count | Hue | Ring | Angle° | Size |
|---|---:|---:|---:|---:|---:|
| Career | 38 | 295 | 0 | 30 | 72 |
| Family | 27 | 25 | 0 | 200 | 60 |
| Health | 22 | 165 | 1 | 130 | 52 |
| Avoidance | 18 | 60 | 1 | 320 | 46 |
| Money | 14 | 115 | 2 | 80 | 40 |
| Relationships | 12 | 345 | 2 | 230 | 36 |
| Sleep | 9 | 235 | 2 | 350 | 32 |
| Growth | 7 | 195 | 3 | 200 | 28 |
| Solitude | 6 | 275 | 3 | 310 | 26 |

**Motion:** When the user lands on this screen for the first time per session, sweep planets in from r×3 to their final positions over 3.2–3.8s with staggered timing (extend the existing pattern from the production app — the user called this out as the one piece of motion to keep).

**Gated state (not pictured in current artboards):** if user has < 10 entries, show locked overlay with "Keep going — 4 more nights to unlock your Theme Map" + faded preview.

### 05 · Life Matrix radar (Insights tab) — `screen-lifematrix.jsx`

12-axis radar with score deltas.

**Layout:**
1. Top bar (same pattern as Theme Map)
2. Segmented tabs (Matrix active)
3. **Score header**: 108px ring with overall score (display 36/800) + "/ 100" eyebrow ; right column: week label, headline "You're trending up across most axes." , delta pill
4. **Radar SVG** (380px tall):
   - 5 concentric polygons at 20/40/60/80/100% (outermost slightly stronger)
   - Axis spokes
   - **Previous week** polygon: dashed stroke at ~18% alpha
   - **Current week** polygon: gradient radial fill (primary → secondary) + gradient stroke + glow filter
   - Score dot at each vertex, colored by delta (mint up, red down, primary same)
   - Axis labels (sans 11/700) + score below (mono 9/600 muted)
5. Legend: "This week" (gradient bar) · "Last week" (dashed line)
6. **Biggest moves** — 4 rows in list groups, each: hue chip badge / axis name + sparkline (gradient stroke + end-dot) / delta + score (display 22/800)
7. AI commentary tinted card

**Axes (12, in this order):** Career, Health, Family, Friends, Romance, Money, Growth, Creativity, Body, Mind, Joy, Purpose.

### 06 · Entries list — `screen-entries.jsx`

Chronological list with consistency heatmap.

**Layout:**
1. Top bar: title (display 28/700 "Entries") + month/count eyebrow + search/filter glass pills
2. **28-night heatmap** card: eyebrow + big "## recorded" + flame streak pill, then 28 cells colored by whether entry exists. Today is `gradMix`, prior wins are `gradPrimary` with descending opacity, gaps are neutral.
3. Grouped sections ("This week" / "Last week") with chronological entry cards:
   - Latest entry has gradient wash + "LATEST" pill (top-right)
   - Each card: 48px date tile (day abbr + date), entry meta (time · duration · #entry), pull-quote (display 15/600 with curly quotes), short summary, theme pills + task count chip

### 07 · Tasks list — `screen-tasks.jsx`

Surfaced todos grouped by recency.

**Layout:**
1. Top bar (same pattern)
2. **3-stat strip** (Today / Upcoming / Done all-time) with delta indicators
3. Segmented tabs (Today | Upcoming | Done) — Today active
4. Grouped sections with list rows:
   - Checkbox (gradient when done, hairline when open) → checked rows get gradient bg + line-through + tertiary text color
   - Task text, theme tag pill, source entry meta ("Entry 41 · Tue 11:18pm")
   - Trailing chevron

### 08 · Goals list — `screen-goals.jsx`

Long-term aspirations.

**Layout:**
1. Top bar with count eyebrow + "+ new goal" gradient FAB
2. Segmented tabs (Active | Done | Dormant)
3. Goal cards (radius 24, hue corner-glow):
   - 62px ring progress (theme-hued, no gradient stroke — solid theme color)
   - Theme pill + "Dormant" tag if applicable
   - Title (display 17/700)
   - Meta row ("Week 6 of 13 · 18 entries touched")
   - **Milestone footer** — inset row with hue dot, latest milestone text, last-touched timestamp
4. AI nudge tinted card at bottom

### 09 · Profile — `screen-profile.jsx`

Settings + subscription + lifetime stats.

**Layout:**
1. Top bar: back, "Profile" title, settings cog
2. **Identity hero card** (radius 28, gradient bg):
   - 64px gradient avatar with initial + 2px white-tint border
   - Name (display 22/700) + Pro pill (gradient w/ sparkle)
   - Email (sans 13)
   - "Member since Jul 2024" eyebrow
   - 3-stat strip divided by hairlines: Entries / Streak / Minutes
3. **Subscription card**: gradient sparkle icon + "Acuity Pro" + price + renewal + green "ACTIVE" pill, feature list inset (3 rows with check icons)
4. **Appearance card (NEW — must build):** group with two rows:
   - **Mode** — segmented control with three options: **System · Light · Dark** (default System). Persist to AsyncStorage as `acuity.mode`. On change, swap tokens by calling `makeAcuityTokens({ dark: resolvedMode === 'dark', accent, boost })`.
   - **Palette** — row of 4 swatch chips (Coral / Sunset / Citrus / Cobalt), each chip is a 36×36 pill showing a 2-color gradient (primary → secondary). Selected chip gets a 2px white-tint outer ring. Persist to AsyncStorage as `acuity.palette`. On change, rebuild tokens with the new `accent` key (`coral` | `sunset` | `citrus` | `cobalt`).
   - Swatch gradient values for the chip preview:
     | Key | Stops |
     |---|---|
     | coral | `oklch(0.84 0.155 38)` → `oklch(0.66 0.18 285)` |
     | sunset | `oklch(0.81 0.165 18)` → `oklch(0.62 0.20 330)` |
     | citrus | `oklch(0.88 0.155 70)` → `oklch(0.68 0.165 195)` |
     | cobalt | `oklch(0.74 0.18 255)` → `oklch(0.78 0.13 85)` |
5. **Settings groups** (grouped lists, label uppercase):
   - **Preferences**: Nightly reminder · Appearance · App lock · Language · **Haptics** _(new — see below)_
   - **Data**: Export entries · Privacy & encryption · Manage account (danger tint)
   - **Support**: Send feedback · Rate Acuity · About
6. Bottom: "Acuity · Built quietly" mono footer

**Haptics setting (NEW — must build):** add a single toggle row to Preferences labeled "Haptic feedback" with a sub-line "Subtle vibration on task complete and celebrations." Stored at `acuity.haptics` (default `true`). Read this flag in the task-check handler before calling `Haptics.impactAsync()`.

**Theme propagation requirement:** Mode + Palette changes must take effect immediately across the entire app, not just the Profile screen. Implement via a top-level `ThemeProvider` that re-runs `makeAcuityTokens` whenever `mode` or `accent` changes and supplies tokens via context. Every screen reads `useTheme()` instead of importing tokens directly.

### 10 · Onboarding step 3 of 8 — `screen-onboarding.jsx`

Life Matrix baseline scoring, one axis at a time.

**Layout:**
1. Top: back / 8-segment progress bar (with current segment widened to 28px) / Skip
2. Eyebrow "Life Matrix · 4 of 12"
3. **Question** (display 30/700) — "Where's your **health** right now?" with the axis name in axis-hue gradient text
4. Subtitle / context paragraph
5. **Big score** (display 88/800) in axis-hue gradient + mood pill ("Feels steady")
6. **Slider** — full-width track with hue-gradient fill, 36px thumb with hue-colored inner dot, "0 · Empty / 50 / 100 · Full" labels below
7. **Mini-radar preview card** (radius 22) — 130px radar showing axes scored so far + current axis with pulsing glow, plus "X of 12 axes scored" copy
8. Bottom: gradient primary CTA "Next axis · Romance →"

### 11 · Post-record extraction review — `screen-extract.jsx`

After saving an entry, review AI's extracted items.

**Layout:**
1. Top: back / center meta ("Entry 42 · 1m 47s · Review what to keep") / Skip
2. **Pull-quote summary card** (gradient bg, radius 24) — "ACUITY HEARD" eyebrow + quote
3. Instruction paragraph: _"Check what feels right. Everything is off by default — keep only what you want to follow."_ — **explicit "check", not "tick"** per brief
4. **Sections** (Themes / Tasks / Goal progress) — each with section head (label + count + sub) and list group of check-rows
5. Check-row: 24px **unchecked** square by default (becomes gradient + white check when on), primary text, sub text (smaller, italic if it's a "quote evidence" snippet), optional theme tag
6. **Sticky bottom action pill** — glass-blur pill with two actions:
   - "Save entry only" (text button)
   - "**Keep N** ✓" (gradient pill with glow, count updates live)

**Initial state critical:** All checkboxes start `off`. The user should opt-in to what they want — never opt-out.

## Motion language (ship these — not optional)

A companion **Acuity Motion Gallery.html** ships in this bundle. Open it in a browser to see each animation live with replay buttons + spec lines. Use it as the engineering source of truth.

All six animations below are **shipping animations** — they're what turns the visual refresh into a feeling app. Easings + durations are committed.

### 1. Voice-reactive recording orb _(Recording screen)_

The central orb is the ceremonial focal point. In production it should react to mic amplitude.

- **Scale:** 1.0 → 1.18 mapped to smoothed RMS of mic input
- **Halo opacity:** 0.3 → 0.85 mapped to same
- **Halo scale:** 1.0 → 1.3
- **Smoothing:** ~80ms exponential moving average so it breathes rather than chatters
- **Idle fallback:** when mic level is below threshold, fall back to the existing 2.6s soft breath
- RN: read mic level via `expo-av` Recording's `onRecordingStatusUpdate` (or equivalent), update via `Animated.spring` or `withTiming`

### 2. Theme Map solar-system entrance _(Theme Map, first focus per session)_

Planets drift in spiralling toward their final orbits.

- **Total duration:** 6.0s
- **Easing:** easeOutCubic `1 - (1-k)^3`
- **Stagger:** 300ms between rings (inner planet starts at 0, outer at +900ms)
- **Spin:** −1 full revolution around YOU center
- **Radius:** starts at 1.45× final, settles to 1.0×
- **Fade-in:** opacity hits 1 at ~30% of each planet's local duration (fast in)
- **Trigger:** first time the screen mounts per session. Not on every focus.
- RN: use `react-native-svg` `<G>` with `Animated.Value` on rotation + translate, or react-native-reanimated's `useDerivedValue` from elapsed time

### 3. Stat count-up _(Home hero ring + tier numbers, on screen focus)_

Numbers tick from 0 to value to feel "alive".

- **Duration:** 850ms
- **Easing:** easeOutCubic
- **Ring fill animates in lockstep** with the number
- **Trigger:** on `useFocusEffect` (React Navigation)
- **Numerals:** `fontVariant: ['tabular-nums']` is non-negotiable; without it digits jitter

### 4. Achievement unlock _(Home achievement strip, when a new badge unlocks)_

For each new achievement, exactly one cycle:

- **Bounce-in:** 420ms `cubic-bezier(.16, .9, .3, 1)` from `scale(0.3)` opacity 0 → `scale(1.12)` opacity 1 → `scale(1)`
- **Shimmer sweep:** 1.4s linear gradient `-200% → 200%` background-position, white at center, 0.25s delay after bounce
- **"JUST NOW" label:** pulses (`opacity 0.55 ↔ 1`) for 30 seconds after unlock, then settles to static "TODAY"
- One-shot per unlock; never re-play

### 5. Task check + finish-day celebration _(Tasks list, Surfaced today, Extract review)_

Every task check:

- **Checkbox fill:** 380ms spring `cubic-bezier(.16, .9, .3, 1)` background swap
- **Check glyph:** spring scale `0 → 1.2 → 1` over 380ms
- **Strike line:** sweeps left → right `width 0 → 100%` over 280ms, 100ms delay
- **Text color:** ease to tertiary color over 280ms
- **Haptic (optional):** `Haptics.impactAsync(ImpactFeedbackStyle.Light)` — **must be toggled by a new setting** (see Profile spec). Default ON.

**Finish-day easter egg (the dopamine moment):**

When the user checks off the **last surfaced task of the day** (Today group goes from 1 → 0 open), spawn confetti:

- **18 particles** in primary/secondary/good/warm-amber/warm-red
- **Each particle:** 5–9px, half rounded / half square, random rotation ±360°
- **Trajectory:** launch fan upward from the just-checked checkbox (angle ∈ [−27°, −153°]), velocity 90–170, then gravity pulls them down 220px
- **Duration:** 1400ms `cubic-bezier(.2, .6, .4, 1)`
- **Fade-out:** opacity 1 until 60%, then → 0
- **Haptic (if enabled):** medium impact at burst
- Only fires once per day (debounce by date). Don't fire if Today was already empty before the check.

RN options: `react-native-confetti-cannon`, or hand-rolled with `Animated`/`react-native-reanimated`.

### 6. Streak tier fill + "+1" floater _(Home Streak tile, when streak ticks)_

- **Progress bar fill:** 520ms `cubic-bezier(.32, .72, 0, 1)` width transition
- **"+1" floater:** appears above the streak number, lifts −16px and fades 0→1→0 over 700ms
- Fires once when the daily entry saves and streak increments (not on screen re-focus)

### What we explicitly dropped

- Radar morph (last-week → this-week tween) — too noisy; current static dual-polygon read is clearer
- Mic FAB breathe — distracting; FAB stays static
- Page transition cross-fade — use React Navigation's iOS default; don't override

## Implementation Notes for React Native

1. **Backdrop blur** — RN needs `expo-blur` (`<BlurView>`). The CSS `backdrop-filter` lives on: bottom tab bar, recording top pills, sticky footer pill in extract review.
2. **Gradient text** (`-webkit-background-clip: text`) — RN needs `react-native-linear-gradient` + a `MaskedView`. Uses: hero score numbers, axis name in onboarding question, name greeting in Ritual variant, tier level number.
3. **CSS oklch** → convert to RGBA/hex (or keep oklch if you're using `react-native-svg` paint where supported). Recommend porting `makeAcuityTokens` to return RGBA strings via `culori` at build time.
4. **Gradients** — use `expo-linear-gradient` for all `gradPrimary` / `gradSecondary` / `gradMix`. Radial gradients (used in hero glow blobs, orb fills) need `react-native-radial-gradient` or layered linear gradients.
5. **SVG** — `react-native-svg` covers everything in: ring progress, sparkbar, waveform, theme map orbital, radar, sparklines.
6. **Fonts** — bundle Manrope (weights 300/400/500/600/700/800) and Geist Mono (400/500/600). Use Expo's `useFonts`.
7. **Mix-blend-mode** for grain — RN doesn't support directly. Skip the blend mode and just use a low-opacity `<Image>` overlay with the noise PNG; it'll read almost identically.
8. **Tabular nums** — RN: `style={{ fontVariant: ['tabular-nums'] }}`. Apply to every stat number.

## Files Bundled

- `README.md` — start here. Tokens, per-screen layouts, motion specs, RN implementation notes
- `index.html` — design canvas (open in browser to explore the 22 screen artboards)
- **`Acuity Motion Gallery.html`** — open in browser to see the 6 shipping animations with replay buttons + spec lines. Engineering source of truth for motion.
- `design-canvas.jsx` — canvas runtime (Figma-style pan/zoom)
- `ios-frame.jsx` — iPhone bezel (reference for status bar / dynamic island sizing)
- `tweaks-panel.jsx` — prototype-only, ignore
- `acuity-tokens.jsx` — **port to TS first**
- `acuity-chrome.jsx` — shared primitives: status bar, tab bar w/ mic FAB, theme pill, ring progress, sparkbar, device frame, icon set
- `motion-gallery.jsx` — motion demo source (read for animation impl reference)
- `screen-home.jsx` — HomeDashboard + HomeRitual + StreakTile + ThemesTile + AchievementStrip + MiniStat
- `screen-entry.jsx`, `screen-recording.jsx`, `screen-thememap.jsx`, `screen-lifematrix.jsx` — hero 5
- `screen-entries.jsx`, `screen-tasks.jsx`, `screen-goals.jsx`, `screen-profile.jsx`, `screen-onboarding.jsx`, `screen-extract.jsx` — extension 6
- `app.jsx` — canvas layout (reference for section order, not for porting)
- `CC_PROMPT.md` — copy/paste prompt for Claude Code

## Outstanding / Not in this bundle

These flows were referenced in the brief but **not designed yet**:

- Weekly Insight delivery moment (the "gift unfolding")
- Theme detail drill-down (tap a planet → entries containing that theme)
- Empty states for first-time tab visits (Entries, Tasks, Goals, Insights)
- Streak break / re-engagement state
- Goal detail / edit screen
- Onboarding steps 1, 2, 4–8
- Settings detail screens (Nightly reminder time picker, Export, etc.)

Ask the designer (this conversation) to extend any of these before implementing if the user-flow requires them.
