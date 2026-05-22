# Acuity Design System

> **Canonical visual reference for both mobile (Expo / RN) and web (Next.js).**
> Read this **before** any UI, visual, or copy work. Do not invent your own interpretation — mirror the doc.
> Last revised: 2026-05-22 (consolidates `_design/design_handoff_acuity_v2/` + mobile v2 ship).

---

## 0. How to use this document

This is the single source of truth for tokens, type, spacing, motion, primitives, voice, and anti-patterns. When a screen spec disagrees with this doc, this doc wins; flag the spec discrepancy in your PR.

Three reading modes:
- **Building a new surface** — read §1 brand vision, §5 primitives, §6 motion, §9 surface inventory.
- **Editing copy** — read §1 brand vision, §7 voice & copy, §8 anti-patterns. Also read `docs/Acuity_SalesCopy.md` (linked).
- **Tweaking visuals** — read §2 color, §3 type, §4 spacing/radii/shadows, §8 anti-patterns.

When in doubt: pick the quieter, more restrained option. The brand fails by being loud, not by being too quiet.

---

## 1. Brand vision

Acuity is a **shutdown ritual** — a nightly voice-journaling app that turns the chaos at the end of someone's day into a 60-second debrief and, every Sunday morning, a 400-word story of the week. The visual language has to feel **atmospheric, refined, restrained, premium-but-warm** — closer to a private notebook in a dim room than to a wellness app. Dark mode is the primary mode. Glow is reserved for the ceremonial moments (mic, orb, primary CTA). Everything else uses soft shadows and hairlines. The product should feel like the difference between staring at a phone and lighting a candle.

---

## 2. Color tokens

Acuity uses a parametric palette generated from a `(mode, accent, boost)` triple. Mobile uses `makeAcuityTokens()` in `apps/mobile/lib/theme/tokens.ts` — web reads the same conceptual tokens as CSS variables. Colors are **OKLCH-based**; oklch() ships in every browser we support (Chrome 111+, Safari 15.4+, Firefox 113+) so we keep them as authored.

### 2.1 Accent presets (warm primary × cool secondary)

| Preset                 | Primary (oklch)      | Secondary (oklch)    | Use                |
| ---------------------- | -------------------- | -------------------- | ------------------ |
| **coral** (default)    | `oklch(0.76 0.155 38)` | `oklch(0.66 0.18 285)` | **Production default** |
| sunset                 | `oklch(0.73 0.165 18)` | `oklch(0.62 0.20 330)` | Alt — warmer       |
| citrus                 | `oklch(0.80 0.155 70)` | `oklch(0.68 0.165 195)` | Alt — cooler-warm  |
| cobalt                 | `oklch(0.66 0.18 255)` | `oklch(0.78 0.13 85)` | Alt — cool-led     |

Production default: `coral`, boost `1.0`. Web ships **coral only** for v1 — the picker is a mobile-only Profile setting; web users see coral. Don't expose other accents on web until Keenan asks for it.

Each preset yields 6 brand-color tokens:

```
primary       — base accent
primaryHi     — primary + 0.08 lightness (lighter top stop in gradients)
primaryLo     — primary − 0.10 lightness (darker bottom stop)
secondary     — base cool accent
secondaryHi   — secondary + 0.08 lightness
secondaryLo   — secondary − 0.10 lightness
```

### 2.2 Surfaces (dark mode — primary)

| Token         | OKLCH                              | Use                                       |
| ------------- | ---------------------------------- | ----------------------------------------- |
| `bg`          | `oklch(0.21 0.022 sh+5)`           | Page background (warm-undertone charcoal) |
| `bgSub`       | `oklch(0.235 0.024 sh+5)`          | Subdued surfaces, headers                 |
| `bgInset`     | `oklch(0.185 0.020 sh)`            | Nested wells (inputs inside cards)        |
| `cardBg`      | `oklch(0.245 0.024 sh+5)`          | Standard card                             |
| `cardBgTint`  | `oklch(0.255 0.034 ph+5)`          | Hue-tinted card (HeroCard primary)        |
| `cardBgRaised`| `oklch(0.27 0.028 sh+5)`           | Raised card (rare — modal headers)        |

Where `sh` = secondary hue, `ph` = primary hue. The +5 hue rotation lifts pure neutrals toward warm/cool depending on accent ("warm undertone charcoal" effect). Don't flatten this to a single grey — that regression is what we corrected in Phase D.

### 2.3 Surfaces (light mode — companion)

| Token         | OKLCH                              | Notes               |
| ------------- | ---------------------------------- | ------------------- |
| `bg`          | `oklch(0.975 0.005 sh)`            |                     |
| `bgSub`       | `oklch(0.96 0.007 sh)`             |                     |
| `cardBg`      | `oklch(1 0 0)`                     | Pure white          |
| `cardBgTint`  | `oklch(0.965 0.012 ph)`            | Hue-tinted card     |

### 2.4 Text

| Token        | Dark                       | Light                      | Use                           |
| ------------ | -------------------------- | -------------------------- | ----------------------------- |
| `text`       | `oklch(0.98 0.004 sh)`     | `oklch(0.14 0.012 sh)`     | Primary body & headings       |
| `textSec`    | `oklch(0.74 0.010 sh)`     | `oklch(0.42 0.010 sh)`     | Secondary copy, descriptions  |
| `textTer`    | `oklch(0.56 0.012 sh)`     | `oklch(0.58 0.012 sh)`     | Meta rows, timestamps         |
| `textQuiet`  | `oklch(0.40 0.008 sh)`     | `oklch(0.74 0.008 sh)`     | Footnotes, disabled           |

### 2.5 Hairlines

| Token         | Dark                  | Light                 | Use                                  |
| ------------- | --------------------- | --------------------- | ------------------------------------ |
| `line`        | `oklch(1 0 0 / 0.07)` | `oklch(0 0 0 / 0.06)` | Default 1px divider                  |
| `lineStrong`  | `oklch(1 0 0 / 0.13)` | `oklch(0 0 0 / 0.10)` | Heavier divider, button outlines     |

Hairlines never use `text*` colors — they're their own scale. Don't use `border: 1px solid var(--text-tertiary)` even though it looks right.

### 2.6 Status colors

| Token       | OKLCH                        | Soft variant (18% alpha) | Use                                            |
| ----------- | ---------------------------- | ------------------------ | ---------------------------------------------- |
| `good`      | `oklch(0.74 0.135 165)`      | `goodSoft`               | Positive deltas, completed, IN_PROGRESS, mint  |
| `bad`       | `oklch(0.66 0.17 25)`        | `badSoft`                | Danger, stop, ROUGH mood, URGENT priority      |
| `WARN_AMBER`| `#FBBF24` (hex literal)      | n/a                      | Non-palette warning: ON_HOLD, HIGH priority, LOW mood, PARTIAL, PRO warning |

**Why amber is hardcoded:** the palette doesn't ship a warning token, and re-declaring `#FBBF24` at six call sites caused drift. Source of truth: `apps/mobile/lib/tone-colors.ts → WARN_AMBER`. If we ever add `tokens.warning`, swap the value at that one constant and every surface updates atomically.

### 2.7 Gradients

All gradients ship as **structured data** in `tokens.ts` so consumers can spread directly into `expo-linear-gradient` / SVG. On web, use CSS `linear-gradient(135deg, ...)`. 135° = top-left → bottom-right.

| Token            | Composition                                  | Use                                                  |
| ---------------- | -------------------------------------------- | ---------------------------------------------------- |
| `gradPrimary`    | `linear(135deg, primaryHi, primary, primaryLo)` | Warm CTAs, streak tile icon, primary buttons         |
| `gradSecondary`  | `linear(135deg, secondaryHi, secondary, secondaryLo)` | Cool accents, weekly insight tile, themes-tile icon  |
| `gradMix`        | `linear(135deg, primary, secondary)`         | Avatar, tier pill text, theme dots, mic FAB, Pro pill |
| `gradMixSoft`    | low-alpha gradMix                            | Subtle backgrounds, hero blob fills                  |
| `heroGrad`       | 2 radial blobs + vertical linear bg          | Top of most screens (Home, Insights)                 |
| `cosmosGrad`     | Radial dark-to-darker                        | Theme Map background                                 |
| `recordGrad`     | Radial primary glow                          | Recording screen background                          |

**Web fallback for radial gradients:** native CSS `radial-gradient()` is fine for `heroGrad`, `cosmosGrad`, `recordGrad`. For mobile RN, layer two `LinearGradient`s — that's the design's endorsed fallback.

### 2.8 Canonical theme palette (9 hues)

These hues anchor the Theme Map orbital cosmos and theme pills across every surface. Source: `apps/mobile/app/insights/_theme-map/types.ts → CANONICAL_HUES`. Themes outside this list hash by FNV-1a to a stable hue (deterministic — same name always renders same color).

| Theme          | Hue | Family   |
| -------------- | --: | -------- |
| Career         | 295 | Violet   |
| Family         | 25  | Coral    |
| Health         | 165 | Mint     |
| Avoidance      | 60  | Amber    |
| Money          | 115 | Green    |
| Relationships  | 345 | Pink     |
| Sleep          | 235 | Blue     |
| Growth         | 195 | Teal     |
| Solitude       | 275 | Purple   |

Dot gradient: `oklch(0.78 0.16 H)` → `oklch(0.55 0.16 H)`. Pill tint: ~9% chroma at the same hue. The pre-computed hex pairs live in `apps/mobile/components/acuity/ThemePill.tsx → THEME_COLORS`.

### 2.9 Life Matrix palette (10 axes)

Per-axis colors for the Phase D 10-axis radar, goal groupings, and mini-radar previews. Source: `packages/shared/src/constants.ts → GOAL_GROUPS`. Hex values are stable across light + dark mode (they're chart colors, not tokens — they need to look right on both surfaces).

| Axis             | Hex       | Icon (Lucide) |
| ---------------- | --------- | ------------- |
| Career           | `#3B82F6` | Briefcase     |
| Money            | `#F59E0B` | Wallet        |
| Romance          | `#EC4899` | Heart         |
| Family           | `#F43F5E` | Users         |
| Friends          | `#14B8A6` | UsersRound    |
| Physical Health  | `#84CC16` | Activity      |
| Mental Health    | `#8B5CF6` | Brain         |
| Growth           | `#A855F7` | Sprout        |
| Fun              | `#F97316` | Sparkles      |
| Purpose          | `#6366F1` | Compass       |

The order is canonical — radar axes, goal groupings, onboarding baseline carousel, and admin dashboards all render in this order.

### 2.10 Web CSS variable mapping (suggested implementation)

Web should expose the resolved hex/oklch as CSS custom properties on `<html data-theme="dark">` (default) or `[data-theme="light"]`. Example sketch:

```css
:root[data-theme="dark"] {
  /* Brand — coral default */
  --acuity-primary:    oklch(0.76 0.155 38);
  --acuity-primary-hi: oklch(0.84 0.155 38);
  --acuity-primary-lo: oklch(0.66 0.155 38);
  --acuity-secondary:  oklch(0.66 0.18 285);
  /* …secondaryHi, secondaryLo… */

  /* Surfaces */
  --acuity-bg:           oklch(0.21 0.022 290);
  --acuity-bg-sub:       oklch(0.235 0.024 290);
  --acuity-card-bg:      oklch(0.245 0.024 290);
  --acuity-card-bg-tint: oklch(0.255 0.034 43);

  /* Text */
  --acuity-text:       oklch(0.98 0.004 285);
  --acuity-text-sec:   oklch(0.74 0.010 285);
  --acuity-text-ter:   oklch(0.56 0.012 285);
  --acuity-text-quiet: oklch(0.40 0.008 285);

  /* Hairlines */
  --acuity-line:        oklch(1 0 0 / 0.07);
  --acuity-line-strong: oklch(1 0 0 / 0.13);

  /* Status */
  --acuity-good: oklch(0.74 0.135 165);
  --acuity-bad:  oklch(0.66 0.17 25);
  --acuity-warn: #FBBF24;

  /* Gradients (as CSS background values) */
  --acuity-grad-primary:   linear-gradient(135deg, var(--acuity-primary-hi), var(--acuity-primary), var(--acuity-primary-lo));
  --acuity-grad-secondary: linear-gradient(135deg, var(--acuity-secondary-hi), var(--acuity-secondary), var(--acuity-secondary-lo));
  --acuity-grad-mix:       linear-gradient(135deg, var(--acuity-primary), var(--acuity-secondary));
}
```

When Tailwind is in use, mirror these as the `acuity-*` keys in `theme.extend.colors` and reference via `bg-acuity-bg`, `text-acuity-text`, etc. **Do not** introduce sibling `acuity-coral-*` / `acuity-violet-*` classes — read from the parametric tokens.

---

## 3. Typography

### 3.1 Families

| Family    | Stack                                              | Use                                       |
| --------- | -------------------------------------------------- | ----------------------------------------- |
| `display` | Manrope → -apple-system → system-ui                | Large stats, titles, hero numbers         |
| `sans`    | -apple-system → SF Pro Text → Roboto → system-ui   | Body, UI labels, descriptions             |
| `mono`    | Geist Mono → SF Mono → ui-monospace → monospace    | Numerals, timestamps, eyebrow / overline  |

Web: load Manrope + Geist Mono via `next/font/google` with `display: 'swap'`. Avoid bundling other display faces — every new font is a render-blocking signal that pushes LCP.

### 3.2 Scale

| Style                  | Family   | Size  | Weight | Letter-spacing | Line-height |
| ---------------------- | -------- | ----- | ------ | -------------- | ----------- |
| Eyebrow / overline     | mono     | 10–11 | 700    | 1.4            | 1.2         |
| Body (floor)           | sans     | 15–17 | 400–500| -0.2           | 1.35–1.5    |
| Body strong            | sans     | 15    | 600    | -0.2           | 1.3         |
| Label                  | sans     | 13    | 600    | -0.1           | 1.3         |
| Display S              | display  | 17–20 | 700    | -0.3           | 1.1         |
| Display M              | display  | 22–28 | 700    | -0.6           | 1.05        |
| Display L              | display  | 30–36 | 700–800| -0.8 / -1.4    | 1           |
| Display XL             | display  | 44–88 | 800    | -1.6 to -3.0   | 1           |

### 3.3 Usage rules

- **Eyebrow labels** are *always* mono, uppercase, 1.4 letter-spacing. Never sans-uppercase. Never display-uppercase.
- **Numerals** always carry `font-variant-numeric: tabular-nums` (RN: `fontVariant: ['tabular-nums']`). Without it, ticking counters jitter. This is non-negotiable for: hero scores, ring progress numbers, tier numbers, streak counts, stat tiles, sparklines axis labels.
- **Body floor is 15pt** (iOS) / 15px (web). Don't drop body below 15. Eyebrow + meta rows go down to 10–11 but in mono.
- **Display sizes are tight** — line-height collapses to 1.0 at Display XL. Don't pad them out with line-height: 1.4.
- **Letter-spacing on display is negative** — visual cohesion at large sizes. Always.
- **Title case for headings**, **sentence case for body and UI buttons**. Avoid Title Case On Buttons.

---

## 4. Spacing, radii, shadows

### 4.1 Spacing

Use a **4pt grid** at the base, with 8/12/16/20/24/32 as the common gaps. Avoid 5/7/9/11/13/15/17 — those are off-grid and visually noisy.

| Scale | Use                                            |
| ----- | ---------------------------------------------- |
| 4     | Tight icon-label gap, pill internal padding    |
| 8     | Default vertical rhythm inside cards           |
| 12    | Section sub-spacing                            |
| 16    | Card content padding (mobile floor)            |
| 20    | Hero card padding, large surfaces              |
| 24    | Between unrelated cards                        |
| 32    | Section breaks                                 |
| 48–64 | Top-of-screen breathing room, marketing heroes |

### 4.2 Radii

| Token  | Px  | Use                                |
| ------ | --- | ---------------------------------- |
| `xs`   | 10  | Inline tags, small chips           |
| `sm`   | 14  | Tile groups, secondary buttons     |
| `md`   | 18  | Tiles, list group containers       |
| `lg`   | 22  | Cards, primary buttons             |
| `xl`   | 28  | Hero cards, marketing hero blocks  |
| `pill` | 999 | Pills, buttons, tags               |

Convention guard-rails:
- **Cards: 22–28**. Never below 22 (looks like a tooltip), never above 28 (looks like a Material Card).
- **Pills + buttons: always 999** (full pill). Never 8, never 12.
- **Setting-row icon containers: 8** (inset look — they shouldn't compete with the row).
- **Inputs: 14** (matches small button).

### 4.3 Shadows

| Token            | Dark                                                                      | Light                                                                  |
| ---------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `shadowSoft`     | `inset 0 1px 0 oklch(1/0.04), 0 8px 22px oklch(0/0.28)`                  | `0 1px 2px oklch(0/0.04), 0 10px 24px oklch(0/0.05)`                  |
| `shadowLift`     | `inset 0 1px 0 oklch(1/0.06), 0 14px 36px oklch(0/0.34)`                 | `0 2px 6px oklch(0/0.05), 0 18px 44px oklch(0/0.08)`                  |
| `glowPrimary`    | `0 0 16px var(--primary)/0.30, 0 8px 18px var(--primaryLo)/0.22`         | same                                                                   |
| `glowSecondary`  | parallel structure with secondary                                         | parallel                                                               |
| `glowSoft`       | `0 6px 18px var(--primaryLo)/0.18`                                       | same                                                                   |

### 4.4 The glow rule (read this twice)

**Glow is reserved for ceremonial elements only:**
- Mic FAB (mobile bottom tab)
- Recording orb (during a recording)
- Tonight's-entry primary CTA (Home Ritual variant)
- "Done" button in the recording controls

**Everything else** uses `shadowSoft` or `shadowLift`. Adding glow to "every gradient surface" was the first wrong turn in the design exploration — explicitly corrected. If you're tempted to add glow to a card, a stat tile, or a navigation pill, **don't**. The brand fails the moment glow becomes ambient.

### 4.5 Texture (the "grain")

Dark surfaces carry a low-opacity SVG turbulence overlay at `mix-blend-mode: overlay`, ~10% opacity. Without it the bg reads as flat black. On web: a small repeating noise PNG (`/static/noise.png`, ~64×64, ≤2KB) at `opacity: 0.08`, `mix-blend-mode: overlay`, fixed-position on the body or applied per-surface for cards. Skip the blend on mobile RN (not supported) — a low-opacity `<Image>` overlay reads almost identically.

---

## 5. Component primitives

The canonical mobile primitives live in `apps/mobile/components/acuity/`. Web should mirror these as React/Tailwind components in `apps/web/src/components/acuity/` (Phase 2+ work — not yet built). Every primitive consumes tokens through context (mobile: `useTheme()`; web: CSS vars). **Never hardcode hex** in a primitive.

### 5.1 Avatar

Gradient circle with initial. `gradMix` linear gradient background, white initial glyph centered, optional 1.5–2px white-tint border (`#ffffff26`) for separation against hero backgrounds.

```tsx
<Avatar initials="J" size={44} />   // Home greeting variant
<Avatar initials="J" size={64} />   // Profile identity hero variant
```

Sizes: `44` (Home), `64` (Profile). Initial font size defaults to ~38% of size. Source: `Avatar.tsx`.

### 5.2 HeroCard

Large gradient-backed card with a soft corner glow blob. Three variants:

- `primary` — `gradPrimary` corner blob over `cardBgTint`. Used for Home hero "Life Matrix" card, Profile identity hero, Entry detail pull-quote, Onboarding extract review pull-quote.
- `secondary` — `gradSecondary` corner blob. Used for Home "Weekly insight teaser".
- `mix` — full-bleed `gradMix` (no surface tint underneath). Used for extract-review hero.

Default padding 20. Radius `xl` (28). Source: `HeroCard.tsx`.

### 5.3 SubscriptionPill

Subscription state badge. Three visual states:

- `PRO` — `gradMix` fill, sparkle icon, 9pt mono uppercase white label. The focal point — never demote it.
- `TRIAL` — `goodSoft` fill + `good` hairline + mint label. Reads as "active + positive".
- `FREE` / `PAST_DUE` / `CANCELED` — quiet pill: `bgSub` fill, `line` border, `textTer` mono uppercase. Deprioritized so PRO stays focal.

```tsx
<SubscriptionPill status="PRO" />
<SubscriptionPill status="TRIAL" label="14 days left" />
```

Source: `SubscriptionPill.tsx`.

### 5.4 ThemePill

Pill with a small theme-color gradient dot + label. Tied to the canonical 9 theme hues (§2.8). Pill background is a low-chroma tint at the same hue; the dot is a 2-stop gradient from `oklch(0.78 0.16 H)` → `oklch(0.55 0.16 H)`.

```tsx
<ThemePill theme="career" />              // dot + "Career"
<ThemePill theme="family" size="s" />     // smaller pill, "Family"
```

Sizes: `s` (12px label, 6px dot) or `m` (13px label, 7px dot, default). Source: `ThemePill.tsx`.

### 5.5 RingProgress

SVG ring with a centered numeric. Default 108px (hero) / 62px (small). Stroke 8 (hero) or 5 (small). Background ring at `lineStrong`, fill ring as either `gradMix` or a solid theme hue, depending on context. Numerals always tabular. Source: `RingProgress.tsx`.

### 5.6 SegmentedTabs

Three-up segmented control (Theme Map | Matrix | Trends, or Today | Upcoming | Done). Active segment uses `gradMix` background + white text. Inactive uses `bgSub` + `textSec`. Radius `pill`. Source: `SegmentedTabs.tsx`.

### 5.7 GlassPill

Glass-blur pill (top-bar Cancel, Recording REC indicator, sticky footer in extract review). Web: use `backdrop-filter: blur(20px) saturate(140%)` + `background: rgba(white, 0.06)` (dark) / `rgba(black, 0.04)` (light). Border: `lineStrong`. Source: `GlassPill.tsx`.

### 5.8 GradientText

Text rendered as a gradient fill. Mobile uses `MaskedView` + `LinearGradient`. Web uses `background-image: var(--acuity-grad-mix); background-clip: text; -webkit-text-fill-color: transparent`. Use cases: hero score numbers, axis name in onboarding question, name greeting in Ritual variant, tier level number. Source: `GradientText.tsx`.

### 5.9 GradientCheckbox

24px square. Unchecked: hairline outline, transparent fill. Checked: `gradMix` fill + white check glyph. Used in: Extract review (initial state is **off** — opt-in, never opt-out), surfaced tasks, finish-day flow. Triggers task-check animation + (optional) haptic. Source: `GradientCheckbox.tsx`.

### 5.10 Sparkbar

7- or 30-day micro bar chart. Each bar `gradPrimary`-filled at variable opacity (today is brightest, prior days descend). Used in: Home hero "32 / this week" sparkbar, Entries 28-night heatmap. Source: `Sparkbar.tsx`.

### 5.11 TierPill

Level + name pill ("Lv 4 · Reflective"). Level number in `gradMix` masked text; the rest in mono uppercase + textSec. Source: `TierPill.tsx`.

### 5.12 MiniRadar

130px radar preview for the Onboarding baseline question and the radar-in-card surfaces. Renders axes scored so far with the current axis pulsing. Source: `MiniRadar.tsx`.

### 5.13 AcuityTabBar

Floating bottom tab bar (mobile only) with a center mic FAB. The FAB carries `gradMix` + `glowPrimary` and is the only persistently glowing element in the app. Source: `AcuityTabBar.tsx`. Web has no direct equivalent — desktop / web nav is a top header.

### 5.14 Button conventions (web specifically)

Web buttons aren't yet in `components/acuity/` — when they ship, follow these rules:

- **Primary CTA** — `gradPrimary` fill, white text, radius 999, padding 14×24, label sans 15/600. Hover: brighten primaryHi by 4% lightness (keeping chroma). Active: shrink 0.98 transform.
- **Secondary CTA** — `bgSub` fill, `line` border, `text` label. Same sizing.
- **Ghost / link** — no fill, `textSec` label, underline on hover.
- **Destructive** — `bad` text, transparent fill, `bad` border. Never `bg-bad-soft` for primary destructive — that reads weaker than the intent.

Never use Tailwind's default `bg-blue-*` / `bg-red-*` / `bg-indigo-*` — every web button reads from the parametric tokens.

### 5.15 Card conventions

- **Default card** — `cardBg` fill, `cardBorder` 0.5px hairline, radius `lg` (22) or `xl` (28), `shadowSoft`. Padding 16–20.
- **Tinted card** — `cardBgTint` fill, no shadow, no corner blob. For lists of grouped rows.
- **Hero card** — see HeroCard primitive (§5.2).

Never stack two glowing cards next to each other. Never put a glow on a card. Glow goes on the FAB/orb/Done button only (§4.4).

### 5.16 Input conventions

- **Text input** — `bgInset` fill, radius `sm` (14), 14px vertical padding, sans 15. Focus: `lineStrong` border + 1px `primary`-tinted ring (no glow).
- **Inline label** — mono uppercase eyebrow above the input, gap 6.
- **Helper / error** — sans 12 `textTer` for helper, `bad` for error. Below the input, gap 4.

### 5.17 Modal conventions

- **Backdrop** — black at 60% opacity (dark mode) or 40% (light). Animate fade-in 280ms ease-standard.
- **Sheet** — radius `xl` top corners, `cardBg` fill, `shadowLift`. Slide up from bottom 340ms ease-standard.
- **Confirm modal** (destructive) — primary CTA uses `bad`-tinted text + outlined button; secondary "Cancel" stays default. Don't use a red filled CTA — too aggressive for our voice.

---

## 6. Motion language

Motion is what turns a static visual refresh into a feeling app. The six shipping animations are documented in `_design/design_handoff_acuity_v2/Acuity Motion Gallery.html` (open in a browser to see them live).

### 6.1 Easings + durations (canonical)

| Token          | Value                            | Use                                  |
| -------------- | -------------------------------- | ------------------------------------ |
| `easeStandard` | `cubic-bezier(.32, .72, 0, 1)`   | All standard transitions             |
| `easeEnter`    | `cubic-bezier(.16, .9, .3, 1)`   | New-element appearances, springy in  |
| `durBase`      | 280ms                            | Tabs, sheets, toggles                |
| `durSlow`      | 340ms                            | Page transitions, hero state changes |

### 6.2 Shipping animations (mobile)

1. **Voice-reactive recording orb** — scale 1.0 → 1.18 + halo opacity 0.3 → 0.85, mapped to smoothed mic RMS (~80ms EMA). Idle falls back to 2.6s soft breath.
2. **Theme Map solar-system entrance** — first focus per session, planets drift in from r×1.45 to r×1.0 over 6.0s, easeOutCubic, 300ms stagger between rings, spin -1 full revolution. **Not on every focus** — only once per session.
3. **Stat count-up** — 850ms easeOutCubic on screen focus, numerals + ring fill animate in lockstep. Requires `tabular-nums`.
4. **Achievement unlock** — bounce-in 420ms easeEnter, shimmer sweep 1.4s, "JUST NOW" label pulses 30s then settles. One-shot per unlock.
5. **Task check + finish-day celebration** — checkbox fill 380ms spring, strike line sweep 280ms (100ms delay), confetti burst on last-task-of-day with 18 particles, 1400ms gravity arc.
6. **Streak tier fill + "+1" floater** — 520ms width transition, "+1" lifts 16px and fades 0→1→0 over 700ms. Fires once when daily entry saves.

### 6.3 Web motion principles

Web doesn't ship every mobile animation (no recording orb on web acquisition pages). What it does ship:
- **Page enter** — content blocks fade-up 280ms easeStandard with 60ms stagger across hero → strip → features.
- **Hover** — buttons brighten + scale to 1.02 over 200ms easeStandard. Cards lift slightly (`shadowSoft` → `shadowLift`) over 200ms.
- **Section scroll-into-view** — use `prefers-reduced-motion` guard. Default ON, but never animate more than one section concurrently.
- **CTA hover** — `gradPrimary` shifts +4% lightness on primary stop. Don't add glow on hover.

### 6.4 What we explicitly do not ship

- **No bounce on buttons** — buttons scale to 0.98 on press, not 1.1.
- **No flashy entrance choreography on marketing pages** — every page-load animation is a fade-up, not a slide-in-from-left.
- **No "shimmer skeleton" loaders on the app pages** — use a quiet spinner or progressive content reveal.
- **No spring physics on text or icons** — only on physical-feeling elements (orb, planet, checkbox).
- **No mic FAB breathing animation** — explicitly dropped (distracting). FAB stays static.
- **No page transition cross-fade** — use the framework default (RN: iOS swipe; Next.js: instant). Don't override.
- **No radar morph** — last-week → this-week tween was tried and dropped (too noisy). Two static polygons read clearer.

### 6.5 Reduced motion

Honor `prefers-reduced-motion: reduce` on web. When set:
- Skip the Theme Map entrance animation (planets appear in place).
- Skip stat count-ups (numbers render immediately).
- Skip confetti.
- Keep fade-ins (still under 200ms, no transform).

---

## 7. Voice & copy guidelines

Acuity copy is governed by the **sales-copy rubric** in `docs/Acuity_SalesCopy.md`. Read it before writing or editing any customer-facing copy. The summary below captures the rules every contributor must internalize — but the rubric is the spec.

### 7.1 Voice — four characteristics

- **Plainspoken** — short sentences, short words, 8th-grade reading level in acquisition copy.
- **Specific to the point of discomfort** — name the time, place, person, number.
- **Observational, not prescriptive** — Acuity notices; it does not command. "You had a lot on your heart tonight" beats "Take time for yourself."
- **Honest about what it isn't** — not a therapist, not a cure. Concede the weakest point first.

### 7.2 Acquisition vs. in-product register

- **Acquisition** (ads, landing, App Store, waitlist): primary term is **"brain dump"**. Maya's friend's voice.
- **In-product** (onboarding, daily app, push, weekly reports, memoirs): primary term is **"daily debrief"**. The voice of a product the user has chosen.

Don't mix registers.

### 7.3 Banned list (full list in §3 of the rubric)

Hard bans across every customer-facing surface:

- **Verbs**: delve, leverage, utilize, harness, streamline, underscore, foster, empower, unlock, navigate, elevate, optimize, maximize, embark, embrace, revolutionize, transform (unless quoting a user), curate, craft (unless literal), supercharge, level up, dive deep, dive in.
- **Adjectives**: pivotal, robust, innovative, seamless, cutting-edge, game-changing, best-in-class, holistic, mindful (unless quoting a user), intentional (filler), meaningful (filler), thoughtful (filler), powerful (without a specific), comprehensive.
- **Nouns**: landscape, realm, tapestry, synergy, testament, underpinnings, journey, ecosystem, solution (for our product), offering, space (as a category), tool (prefer "app"), platform (prefer "app"), experience (as a synonym for product).
- **Transitions**: furthermore, moreover, consequently, notably, importantly, "in today's fast-paced world", "whether you're…", "at its core", "more than just", "simply put", "in essence".
- **Structures**: three-adjective tricolons (especially alliterative — "simple, smart, seamless"); rhetorical questions as headlines; "Imagine if…"; "The future of X is Y"; "We believe…"; "Say goodbye to…"; slogan-style hero headlines.
- **Claims**: "AI-powered" above the fold; "science-backed" without a citable study; "therapist-approved" unless a named therapist did; round-number social proof ("10,000+ users") without a name; "loved by [unnamed publications]".

### 7.4 Conditional bans

- **"Journaling" / "journal"** — banned in all acquisition copy. Acuity's category is the shutdown ritual, not journaling. Allowed only inside a user quote or where SEO intent demands it.
- **"AI"** — discouraged. Use only when it earns trust (FAQ, naming Whisper + Claude). Never above the fold.

### 7.5 Harry Dry's three rules — every sentence must pass

- **Specific** — could a designer sketch this sentence as an illustration?
- **Falsifiable** — could two people disagree about whether the claim is true?
- **Unique** — could a competitor say it without changing a word?

If any test fails, rewrite.

### 7.6 Acuity-specific positioning rules

- **Category** — shutdown ritual. Not journal. Not mood tracker. Not wellness app.
- **Hero driver is the weekly report**, not the daily recording. Daily recording is the input; weekly report is the output worth paying for.
- **Memory is the product, not intelligence.** "Remembers" and "memory" are approved; "insights" and "intelligence" are discouraged.
- **Never promise therapeutic outcomes.** Acuity is not a medical device. "What happens the other 167 hours of the week" is the approved framing around therapy.
- **Privacy is a structural claim, not a tone.** "Your data is secure" fails. "Voice recordings are deleted within 24 hours of transcription" passes.

### 7.7 Mechanical rules

- **One em-dash per section**, max.
- **Max four "you"s per paragraph** before switching to "most people" / a named example.
- **Zero exclamation points in acquisition copy** (one allowed in the Day-7 weekly-report push).
- **Sentence case for UI buttons** ("Start your debrief", not "Start Your Debrief").
- **No rhetorical questions in the hero** or first line of any section.

### 7.8 The single hardest test

Read the copy out loud at 10:14 PM in a dark room as the last thing before sleep. If any sentence feels like it was written by a committee or an AI, rewrite. Maya will read this with a glowing phone an inch from her face. She has read ten thousand landing pages. She recognizes slop in under 4 seconds.

---

## 8. Anti-patterns (the don'ts)

Explicit list of what we never ship. If you find yourself reaching for one of these, stop.

### 8.1 Visual anti-patterns

- **Glossy 3D spheres.** Phase E first attempt at Theme Map planets used 3-stop bright radial gradients with hard inset highlights. Read as kitsch. **Use atmospheric 4-stop gradients with reduced HSL saturation (~42%).** Planets are dim glowing bodies, not gym-app icons.
- **Bright gradient everywhere.** Adding glow to every card / button / pill was the first wrong turn in the design exploration. **Glow = ceremonial elements only** (mic FAB, recording orb, primary CTA, Done button).
- **Debug text shipped to production.** The first Theme Map build had "CENTER" rendered in the center pip. **Always grep your changes for `'CENTER'`, `'TODO'`, `'DEBUG'`, console.log statements before shipping.**
- **Chunky labels.** Theme Map planet labels were initially bold + uppercase + chunky. **Use sans 11–12 / 500 weight / sentence case for in-canvas labels.**
- **Flashy entrance choreography.** Spin-in motion at the planet level was correct; full app-load slide-ins are not. **Mostly fade-ups, occasional spring on physical elements.**
- **Aggressive saturation in dark mode.** Cranking chroma to compensate for low-light viewing breaks the atmospheric feel. **Keep chroma in the 0.10–0.18 range. Boost only if explicit.**
- **Pure black backgrounds.** `#000` is a regression. **Use `bg` token (lifted-off-black with warm undertone).**
- **Hard rings around avatars / icons.** Borders are `#ffffff26` (15% alpha white tint) or hairlines (`line`), never `#fff` solid.
- **Material Design–style elevation.** Cards lift with `shadowSoft` (8/22/0.28), not a hard 8dp elevation shadow.
- **Mid-screen modals.** Use bottom sheets (mobile) or top-anchored modals (web). No floating-in-the-middle dialog boxes — they feel like a 2018 web app.

### 8.2 Copy anti-patterns

- "AI-powered" above the fold.
- "Tired of feeling overwhelmed?" — rhetorical question in the hero.
- "Journaling" anywhere in acquisition copy.
- "Imagine if you could…" / "What if…" / "Say goodbye to…" openers.
- Three-adjective tricolons. "Simple, smart, seamless" reads as GPT-wrapper boilerplate.
- "We believe…" / "Our mission is…" on a landing page hero. Belongs on About, not hero.
- Round-number social proof. "10,000+ users" without a name is worse than no social proof.
- Therapeutic-outcome claims. We don't reduce anxiety; we transcribe and summarize.
- Slogan headlines. "Think better. Feel better. Live better." is banned.
- "Powered by Claude" as a hero claim. Anthropic's stack is FAQ material, not above-the-fold material.

### 8.3 Architecture anti-patterns

- **Hardcoding hex inside components.** Every component reads from tokens (mobile: `useTheme()`; web: CSS vars). The only allowed exception is `WARN_AMBER` (`#FBBF24`), which lives in one place and is imported.
- **Inventing sibling token names.** "We need a calmer primary" → no, you need to use `primaryLo`. "We need an info blue" → no, use `textSec` for info (it has the same role on mobile).
- **One-off CSS values in a component.** If you need a radius of 16, use `md` (18) or `sm` (14). Off-grid radii feel like a rendering bug.
- **Mocking the design system in Storybook with different tokens.** If you can't render the surface against the canonical tokens, the canonical tokens are missing something — fix that, don't fork.

---

## 9. Surface inventory

Mapping of every shipped surface to which patterns apply. Use this as a checklist when refreshing a screen.

### 9.1 Mobile (Expo / RN) — shipped Phase D + E

| Surface                       | Hero pattern        | Primitives                                                  | Motion                       |
| ----------------------------- | ------------------- | ----------------------------------------------------------- | ---------------------------- |
| Home (Dashboard variant)      | HeroCard `primary`  | RingProgress, Sparkbar, TierPill, Avatar, ThemePill, AcuityTabBar | Stat count-up (focus), Streak floater (entry-save) |
| Home (Ritual variant, light)  | Full-width CTA      | GradientText, Sparkbar, Avatar                              | Stat count-up                |
| Entry detail                  | HeroCard `primary` pull-quote | GradientCheckbox, ThemePill, RingProgress (goal touched) | Fade-in on focus             |
| Recording                     | recordGrad halo     | GlassPill, GradientText (timer), gauge SVG                  | Voice-reactive orb, REC dot, waveform |
| Theme Map (Insights)          | cosmosGrad orbital  | SegmentedTabs, GlassPill (callout)                          | Solar-system entrance (first session focus) |
| Life Matrix radar (Insights)  | RingProgress hero + radar SVG | SegmentedTabs, GradientText (axis name)              | Static dual-polygon read     |
| Entries list                  | 28-night heatmap card | Avatar, ThemePill, Sparkbar                               | Fade-in                      |
| Tasks list                    | 3-stat strip        | SegmentedTabs, GradientCheckbox, ThemePill                  | Task check + finish-day confetti |
| Goals list                    | Per-card hue corner glow | RingProgress (theme-hued), ThemePill                   | Fade-in                      |
| Profile                       | HeroCard identity   | Avatar (64), SubscriptionPill, settings groups              | Fade-in                      |
| Onboarding axis baseline      | GradientText question + MiniRadar preview | Slider w/ hue-gradient track       | Slider haptic on tick        |
| Extract review                | HeroCard `mix` pull-quote | GradientCheckbox (off by default), GlassPill footer  | Task check spring            |

### 9.2 Web — to be inventoried in Phase 1 audit

See `_design/web-parity-audit.md` (Phase 1 deliverable) for the route-by-route inventory and gap analysis. The audit catalogs each marketing route, each signed-in app route, the current visual state, and the patterns that should apply.

### 9.3 Pattern-to-primitive map

When asked "should this surface have X", read this table:

| Surface need                                | Pattern               | Primitive                |
| ------------------------------------------- | --------------------- | ------------------------ |
| Hero block with stat + headline + CTA       | HeroCard primary      | `HeroCard variant="primary"` |
| User identity strip                         | Identity hero         | `Avatar + SubscriptionPill + Tier/meta row` |
| Primary action                              | CTA button            | `Button variant="primary"` (web) / `gradPrimary` pill (mobile) |
| Inline status / category tag                | Pill                  | `ThemePill` or `SubscriptionPill` or `TierPill` |
| Single-stat display                         | Number with eyebrow   | `GradientText` + mono eyebrow |
| Progress toward a goal                      | Ring                  | `RingProgress` |
| Multi-axis comparison                       | Radar                 | `MiniRadar` (≤130px) or full radar SVG (full screen) |
| Trend over time                             | Sparkbar / sparkline  | `Sparkbar` (bars) or SVG path (line) |
| Section switcher                            | Segmented control     | `SegmentedTabs` |
| Floating overlay (top bar pill, sticky footer) | Glass pill         | `GlassPill` |
| Form field                                  | Input                 | `bgInset` + radius `sm` + focus ring |
| Confirmation / destructive prompt           | Bottom sheet / modal  | Modal with `bad`-tinted text button |

---

## 10. Implementation references

- **Tokens (mobile, canonical):** `apps/mobile/lib/theme/tokens.ts`
- **Theme context (mobile):** `apps/mobile/contexts/theme-context.tsx`
- **Tone resolvers (mobile):** `apps/mobile/lib/tone-colors.ts`
- **Primitives (mobile):** `apps/mobile/components/acuity/` — barrel in `index.ts`
- **Life Matrix axes (shared):** `packages/shared/src/constants.ts`
- **Theme palette (mobile):** `apps/mobile/app/insights/_theme-map/types.ts`
- **Design handoff (source of truth):** `_design/design_handoff_acuity_v2/README.md`
- **Motion gallery:** `_design/design_handoff_acuity_v2/Acuity Motion Gallery.html`
- **Sales copy rubric:** `docs/Acuity_SalesCopy.md`
- **Web tokens:** _not yet ported — Phase 2 work._

---

## 11. Versioning

This doc is the canonical reference. When the design intent changes:

1. Update tokens (`apps/mobile/lib/theme/tokens.ts`) first.
2. Update this doc.
3. Bump the "Last revised" date at the top.
4. Note the change in `PROGRESS.md` under the appropriate dated entry.

Anti-patterns get added — never removed retroactively. If a "don't" is reconsidered, mark it `~~struck~~` with a date and a reason, but keep it visible. Memory of past failures is what keeps the brand from drifting.

---

*End of v1.0 · 2026-05-22.*
