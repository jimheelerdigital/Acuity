# Acuity — Marketing Home handoff

A complete, working redesign of the Acuity marketing home page (`getacuity.io`),
rebuilt on the **same design system as the app** so the site and product match 1:1.
Open `Marketing Home.html` in a browser to see the target — it runs as-is, no build.

> This is a **design reference**, not the production page. It's a single
> React-via-Babel prototype. Your job is to rebuild it as a real Next.js page on
> `acuity.io`, keeping the visual result identical. Everything you need to match
> pixels — exact colors, gradients, type, spacing, motion — is in these files.

## What's in this folder

```
marketing_handoff/
├─ README.md              ← you are here
├─ Marketing Home.html    ← entry point — open in a browser to see the goal
├─ marketing.jsx          ← the whole page (nav, hero, sections, pricing, footer)
├─ acuity-tokens.jsx      ← THE design system. makeAcuityTokens() = every color/grad/shadow/font
├─ acuity-chrome.jsx      ← shared app primitives + icons (AcuityIcons, RingProgress, etc.)
├─ badge-system.js        ← achievement badge SVG renderer (used in the badges section)
├─ screen-home.jsx        ← real app Home screen (shown in hero + feature 1)
├─ screen-thememap.jsx    ← real app Theme Map screen (feature 2)
├─ screen-lifematrix.jsx  ← real app Life Matrix screen (feature 3)
└─ screen-entry.jsx       ← only for the shared `pillBtn` helper the two screens above import
```

## How it renders today (prototype)

`Marketing Home.html` loads React 18 + Babel standalone, then the JSX files in
order. `marketing.jsx` mounts `<Marketing/>` into `#root`. The phone mockups are
the **real app screen components** (`HomeDashboard`, `ThemeMap`, `LifeMatrix`)
scaled down inside a `PhoneFrame` — that's why they're pixel-true to the app.

Load order matters: `screen-entry.jsx` must load before `screen-thememap.jsx` /
`screen-lifematrix.jsx` because they share its `pillBtn` helper (exported on
`window`). The HTML already does this correctly.

## The design system (read this first)

**`acuity-tokens.jsx` → `makeAcuityTokens({ dark, accent, boost })`** is the single
source of truth. Don't hardcode colors — derive them. Key facts:

- **Accent** is a warm-primary × cool-secondary duo. Default `coral` =
  coral/orange × violet. Three more presets exist (`sunset`, `citrus`, `cobalt`).
- **Not purple-black.** Dark mode bg is a *lifted warm charcoal*
  (`oklch(0.21 0.022 ~285)`), with a subtle SVG grain overlay — deliberately not
  flat black. This was the whole point of the refresh.
- **Light mode** is a warm off-white. The page defaults to light with a nav toggle.
- Everything is **oklch**. Gradients: `gradPrimary`, `gradSecondary`, `gradMix`,
  `heroGrad`. Shadows: `shadowSoft`, `shadowLift`, `glowPrimary` (reserve glow for
  hero CTAs/FAB only). Radii in `t.radius`. Fonts: `t.display` (Manrope),
  `t.sans` (system), `t.mono` (Geist Mono). Motion: `t.easeStandard`,
  `t.easeEnter`, `t.durBase` 280ms / `t.durSlow` 340ms.

For the production site, port `makeAcuityTokens` into CSS variables (or a Tailwind
theme) so light/dark + the 4 accents all fall out of one place. The function is
pure and ~140 lines — translate it directly.

## Page structure (`marketing.jsx`)

1. **Nav** — sticky glass bar, wordmark, anchor links, theme toggle, CTA.
2. **Hero** — gradient headline (`gradMix` text clip), real Home phone, 3 floating
   "extraction" chips (Task→Career, Mood +5, 14-night streak).
3. **How it works** — 3 numbered cards, gradient icon tiles (coral/violet/mint).
4. **Feature ×3** — alternating copy + phone. Home (dark), Theme Map (dark),
   Life Matrix (light — intentionally shows the app's light mode).
5. **Consistency** — floating achievement badges (bronze→diamond) via `badge-system.js`.
6. **Pricing** — single card, **$4.99/mo, 14-day trial** (matches the live site).
7. **Final CTA** — full-bleed gradient band.
8. **Footer** — columns + legal.

Motion: `.reveal` class + `useReveal()` (IntersectionObserver) fades sections up on
scroll; hero chips and badges have a gentle float. Respects
`prefers-reduced-motion`.

## Build notes / decisions to make

- **Phone mockups.** Easiest production path: render these screens at build time to
  static images/SVG and drop them in, OR keep them as real components if the
  marketing site shares the app's component library. Don't rebuild them by hand —
  reuse `screen-*.jsx` + `acuity-chrome.jsx`.
- **Existing animations.** The current live site has motion (by Keenan) that this
  prototype does **not** reproduce — I could only read the site's text, not its
  code. Re-apply those where you want them; the section structure here is plain and
  will accept them.
- **Placeholder content.** Copy, the **4.9 rating**, and feature bullets are
  believable placeholders. Swap in real numbers/testimonials before publishing.
- **App Store button** is intentionally generic (no Apple trademark art) — replace
  with the official badge in production.
- **Accent switcher.** The app supports 4 palettes; the marketing page is wired for
  `coral`. If you want the site to theme too, pass a different `accent` to
  `makeAcuityTokens` — everything re-derives.

## Quick start for the rebuild

1. Open `Marketing Home.html` in a browser — this is the visual target.
2. Read `acuity-tokens.jsx`; port it to your CSS-vars / Tailwind theme.
3. Rebuild each section from `marketing.jsx` as Next.js components, pulling values
   from the tokens (no hardcoded hex).
4. For the phone mockups, reuse the real screen components or pre-render them.
5. Diff against the HTML until it matches in both light and dark.
