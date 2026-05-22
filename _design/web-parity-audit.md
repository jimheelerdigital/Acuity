# Acuity Web Parity Audit

> **Status:** Phase 1 audit · No code changes. Findings only.
> **Date:** 2026-05-22
> **Companion to:** `_design/DESIGN_SYSTEM.md` (Phase 0 canonical reference)
> **Scope:** Every route under `apps/web/src/app/` — marketing + signed-in.

This audit catalogs the gap between the web app's current state and the canonical design system shipped with mobile v2. Web ships on its own cadence via Vercel; marketing surfaces are the ad-acquisition funnel, so they top the priority list.

---

## 1. Marketing inventory

Every public / unauthenticated route, what's on it today, and the chrome it inherits.

| # | Route                          | Source                                                  | Current state (short)                                                                                                                                  |
| - | ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | `/`                            | `src/app/page.tsx` + `src/components/landing.tsx`       | Hero "One minute a day. A life of clarity." + animated phone, testimonials, pricing cards, FAQ. Uses Inter/Playfair, brand purple `#7C5CFC`, light bg `#FAFAF7` with dark interludes. |
| 2 | `/auth/signin`                 | `src/app/auth/signin/page.tsx`                          | Dark centered card on light background, OAuth (Google, Apple) + email/password + magic link. Violet-500 focus ring.                                    |
| 3 | `/auth/signup`                 | `src/app/auth/signup/page.tsx`                          | Two-column split: left value props + testimonial, right form. Meta Pixel CompleteRegistration tracking. 30-day trial copy.                             |
| 4 | `/waitlist`                    | `src/app/waitlist/page.tsx`                             | Pre-launch waitlist form (still live). Hero "Acuity is almost ready." Light cream bg, violet CTAs, shimmer.                                            |
| 5 | `/voice-journaling`            | `src/app/voice-journaling/page.tsx`                     | ~2,500-word SEO pillar article. Dark `#0A0A0F`. Prose-invert via `@tailwindcss/typography`. JSON-LD Article + FAQPage.                                 |
| 6 | `/blog`                        | `src/app/blog/page.tsx`                                 | Blog index grid (2-col desktop). Merges static + DB posts (status `DISTRIBUTED`, `AUTO_PUBLISHED`). ISR 5-min revalidate.                              |
| 7 | `/blog/[slug]`                 | `src/app/blog/[slug]/page.tsx`                          | Dynamic post detail. Prose-invert. Related posts (3), BlogCta. Sanitizes scripts/iframes from DB HTML.                                                 |
| 8 | `/for/[slug]` (DB-driven)      | `src/app/for/[slug]/page.tsx`                           | Meta ad landers built in AdLab (DB-stored heroHeadline/painPoints/valueProps/testimonialQuote/closingHeadline). Each gets its own AttributionSetter.   |
| 9 | `/for/therapy`                 | `src/app/for/therapy/page.tsx` (static)                 | Static persona lander "The Overthinker". Routes CTA to `/auth/signup?ref=therapy`.                                                                     |
|10 | `/for/founders`                | `src/app/for/founders/page.tsx` (static)                | Static persona lander "The Builder".                                                                                                                   |
|11 | `/for/sleep`                   | `src/app/for/sleep/page.tsx` (static)                   | Static persona lander, sleep-focused cohort.                                                                                                           |
|12 | `/for/decoded`                 | `src/app/for/decoded/page.tsx` (static)                 | Static persona lander, self-optimizer cohort.                                                                                                          |
|13 | `/for/weekly-report`           | `src/app/for/weekly-report/page.tsx` (static)           | Static persona lander, weekly-report-led cohort.                                                                                                       |
|14 | `/privacy`                     | `src/app/privacy/page.tsx`                              | Legal: 9 sections, subprocessor list (Anthropic, OpenAI, Supabase, Stripe, Apple, Resend, Vercel, Inngest). Last updated 2026-05-14.                   |
|15 | `/terms`                       | `src/app/terms/page.tsx`                                | Legal: 13 sections. Yellow alert box for "Not therapy" disclaimer. Last updated 2026-05-12.                                                            |

**Total: 15 named routes + N dynamic AdLab landers.** All marketing surfaces bypass `AppShell` and have their own chrome.

### 1.1 Shared marketing infrastructure

- **`<NavBar>`** (`src/components/nav-bar.tsx`) — fixed top nav, persona dropdown ("Who it's for"), hamburger on mobile. Rendered globally; visible on all marketing pages.
- **`<LandingPage>`** (`src/components/landing.tsx`) — full-page client component for `/` only. Owns hero, testimonial ticker, pricing cards, FAQ accordion. Carries its own fixed nav overlay (duplicates NavBar — see §4.4).
- **No shared marketing footer.** Legal pages have a single back-link; landing has a custom footer block; persona landers have their own minimal footers. Drift target.
- **`<CrisisFooter>`** — authenticated-only. Not visible on marketing.

### 1.2 Marketing globals

- **Fonts:** Inter (sans, `next/font`), Playfair Display (display serif, `next/font`), Geist Mono (referenced in Tailwind config but not loaded).
- **Tailwind config** (`apps/web/src/app/tailwind.config.ts`) defines:
  - `brand` palette 50–900 capped at `#7C3AED` (violet-600)
  - `warm` palette: `amber: #E8B88A`, `gold: #D4A574`, `muted: #B0A898`, `bg: #181614`, `card: #1E1C1A`, `card-inner: #252220`
  - `darkMode: "class"` (not `prefers-color-scheme`)
  - Custom keyframes: `fadeIn`, `fadeInUp`, `pulse-slow`, `cta-shine`
- **`globals.css`** ships 10+ custom animations: float, blob-drift, shimmer, ticker, pulse-ring, gradient-shift, wave-bars, mood-bar, gentle fade-up, hero-float. Respects `prefers-reduced-motion`.
- **Theme color meta:** `#7C5CFC` (current brand purple).
- **OG image:** `/og-image.png?v=3` (1200×630).
- **No `@acuity/shared` imports anywhere in marketing.** Marketing is fully decoupled from the shared package.
- **No imports from `apps/mobile/components/`** anywhere in web app (confirmed).

---

## 2. Signed-in inventory

Every authenticated route, what data it shows, refresh state.

| # | Route                              | Source                                            | Hero pattern + state                                                                                          |
| - | ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1 | `/home`                            | `src/app/home/page.tsx`                           | Dashboard: greeting + Record button, today's prompt, 7-card grid (streak, Life Matrix mini, weekly insight, goals snapshot, recent sessions, open tasks). Per-card Suspense. **Refreshed but stale palette** — uses `#1E1E2E` cards + violet-600 accents, not canonical tokens. |
| 2 | `/entries`                         | `src/app/entries/page.tsx`                        | Chronological list (100-row take), client-side mood filter + search. Zinc + dark palette. No 28-night heatmap (mobile has it).                                                                                                                |
| 3 | `/entries/[id]`                    | `src/app/entries/[id]/page.tsx`                   | Entry detail: date header, mood/energy tags, summary, themes (inline pills), wins/blockers (lists), task cards, transcript. No HeroCard pull-quote, no `<ThemePill>` primitive — pills are bespoke. |
| 4 | `/insights`                        | `src/app/insights/page.tsx`                       | Insights hub: Life Matrix + Theme Map featured cards, timeline, Ask + State of Me, metrics drawer (Health Correlations). Pro-gated. Uses gradient cards (violet/indigo/amber) — visually dated, not atmospheric.                              |
| 5 | `/insights/ask`                    | `src/app/insights/ask/page.tsx`                   | "Ask your past self": free-form question input, AI search over transcript history. Dark card, violet focus.                                                                                                                                  |
| 6 | `/insights/state-of-me`            | `src/app/insights/state-of-me/page.tsx`           | Quarterly narrative list (90-day reports, manual trigger w/ 30d cooldown). Status pills.                                                                                                                                                     |
| 7 | `/insights/state-of-me/[id]`       | `src/app/insights/state-of-me/[id]/page.tsx`      | Quarterly narrative detail. Reads `StateOfMeContent` from DB.                                                                                                                                                                                |
| 8 | `/insights/theme-map`              | `src/app/insights/theme-map/page.tsx`             | **Force-directed graph** (`force-graph-2d` canvas) — NOT the orbital cosmos shipped on mobile. Time-window selector, progression-gated. **Significant feature drift.**                                                                       |
| 9 | `/insights/theme/[themeId]`        | `src/app/insights/theme/[themeId]/page.tsx`       | Theme detail: client-rendered related entries + metrics for a single theme.                                                                                                                                                                  |
|10 | `/life-matrix`                     | `src/app/life-matrix/page.tsx`                    | Full-screen 10-axis radar (good — already on Phase D vocab). Progression-gated (5+ entries).                                                                                                                                                |
|11 | `/goals`                           | `src/app/goals/page.tsx`                          | Goals list + right detail rail (2xl breakpoint). Server computes focus goal. Cards are bespoke; no `GoalCard` primitive.                                                                                                                     |
|12 | `/goals/[id]`                      | `src/app/goals/[id]/page.tsx`                     | Goal detail: title, description, life area, progress %, notes, linked entries (explicit + fuzzy-matched).                                                                                                                                    |
|13 | `/tasks`                           | `src/app/tasks/page.tsx`                          | Task list. Pro-locked empty state for FREE.                                                                                                                                                                                                  |
|14 | `/account`                         | `src/app/account/page.tsx`                        | Settings hub: subscription status, trial end, notification prefs, calendar integration, backfill extraction, email prefs. Mixes amber warning sections with zinc cards.                                                                      |
|15 | `/onboarding`                      | `src/app/onboarding/page.tsx` + `steps/*`         | 10-step flow controlled by `?step=N`. **Still uses V1 6-axis life areas in step 7** — mobile is on Phase D 10-axis. Cross-stack drift. See §5.                                                                                               |
|16 | `/upgrade`                         | `src/app/upgrade/page.tsx`                        | Paywall: monthly/annual toggle, 6-feature list, success copy. Pragmatic, not atmospheric.                                                                                                                                                    |
|17 | `/admin` + `/admin/*`              | `src/app/admin/...`                               | Admin dashboard, AdLab, blog pruner, content factory. Custom ultra-dark `#0A0A0F` palette outside the standard system. Internal tooling — treat as scoped exception.                                                                         |

### 2.1 Web `AppShell`

Wraps all authenticated pages **except**: `/`, `/auth/*`, `/for/*`, `/blog/*`, `/voice-journaling*`, `/waitlist`, `/privacy`, `/terms`, `/support`, `/onboarding`, `/upgrade`, `/admin`. Renders a 272px sidebar (lg+) + top bar. Uses Lucide icons. Currently styled with zinc/white classes, not canonical tokens.

---

## 3. Token mismatch report

What the web app uses today vs. what `DESIGN_SYSTEM.md` declares canonical. Specific files cited.

### 3.1 Color palette

| Aspect          | Canonical (mobile)                                    | Current (web)                                              | Severity |
| --------------- | ------------------------------------------------------ | ---------------------------------------------------------- | -------- |
| Primary accent  | `oklch(0.76 0.155 38)` (coral, hex ~`#F69A6A`)         | `#7C3AED` / `#7C5CFC` (Tailwind violet-600 family)         | **High** |
| Secondary accent| `oklch(0.66 0.18 285)` (violet)                        | none — gradients hardcode violet/indigo                    | **High** |
| Dark surface bg | `oklch(0.21 0.022 sh+5)` (warm-undertone charcoal)     | `#181614` / `#0A0A0F` (varies by page — different `bg`!)   | **High** |
| Card bg (dark)  | `oklch(0.245 0.024 sh+5)`                              | `#1E1E2E` (literal hex, not parametric)                    | **High** |
| Card border     | `cardBorder` (`#ffffff0d`)                             | `border-white/10` (close but inconsistent — also `/20`, `/40`) | Medium   |
| Text primary    | `oklch(0.98 0.004 sh)` (warm-tinted white)             | `text-zinc-50` / `text-white` / `#F5EDE4`                  | Medium   |
| Text secondary  | `oklch(0.74 0.010 sh)`                                 | `text-zinc-400/500` / `#A0A0B8` / `#E5E5EC`                | Medium   |
| Status good     | `oklch(0.74 0.135 165)` (mint)                         | `emerald-400/500` (Tailwind default)                       | Medium   |
| Status bad      | `oklch(0.66 0.17 25)` (red ember)                      | `red-400/500` / `rose-*`                                   | Medium   |
| Warning amber   | `#FBBF24` (canonical exception)                        | `amber-300/500/900` (Tailwind ramp, drifted)               | Medium   |

**Conclusion:** the web app's brand color is a different family entirely (violet) from the mobile v2 default (coral × violet). This is the single biggest visual gap. A user who installs the app from a violet landing page sees a coral hero on first launch — the brand reads as different products.

### 3.2 Typography

| Aspect          | Canonical                          | Current (web)                                | Severity |
| --------------- | ---------------------------------- | -------------------------------------------- | -------- |
| Display family  | Manrope                            | Playfair Display (serif) ← **wrong category**| **High** |
| Sans family     | -apple-system / SF Pro             | Inter                                        | Medium   |
| Mono family     | Geist Mono                         | Geist Mono (referenced, not loaded)          | Low      |
| Body floor      | 15pt with `tabular-nums` on stats  | Tailwind default; no enforcement of tabular  | Medium   |
| Display weights | 700–800 bold, tight letter-spacing | Playfair displays at default tracking        | **High** |

Playfair Display vs. Manrope is a brand-direction difference: serif-editorial vs. sans-modern. Mobile picked the sans-modern direction in the v2 refresh. Web is still on the editorial side.

### 3.3 Radii + spacing

| Aspect                        | Canonical          | Current (web)                                        | Severity |
| ----------------------------- | ------------------ | ---------------------------------------------------- | -------- |
| Card radius                   | 22–28 (`lg`/`xl`)  | Tailwind `rounded-lg` (8) / `rounded-xl` (12) / `rounded-2xl` (16) — all below canonical floor | **High** |
| Pill / button radius          | 999                | mostly `rounded-full` ✓                              | Low      |
| Spacing grid                  | 4pt (4/8/12/16/20/24/32) | Tailwind default 4pt grid ✓                    | Low      |
| Card padding                  | 16–20              | `p-4` (16) / `p-6` (24) — mostly aligned             | Low      |

### 3.4 Shadows + glow

| Aspect              | Canonical                                           | Current (web)                                       | Severity |
| ------------------- | --------------------------------------------------- | --------------------------------------------------- | -------- |
| Card shadow         | `shadowSoft` (inset + outer drop)                   | Tailwind `shadow-lg` / `shadow-xl` / `shadow-2xl`   | Medium   |
| Glow rule           | Ceremonial only (mic FAB, orb, primary CTA)         | Ambient shimmer / pulse-ring / blob-drift on landing — glow is everywhere | **High** |
| Texture grain       | Low-opacity noise PNG overlay at `mix-blend-mode: overlay` | None — flat surfaces                          | Medium   |

The marketing landing carries six concurrent ambient animations. That is the exact failure mode the design system flags in §8.1 ("bright gradient everywhere", "glow rule").

### 3.5 Worst offenders — top files

In rough order of severity:

1. **`apps/web/src/components/landing.tsx`** — every brand affordance violates the canonical tokens. Hardcodes `#7C5CFC` brand color, uses Playfair display family, layers blob-drift/shimmer/gradient-shift simultaneously. The single highest-leverage file to refresh.
2. **`apps/web/src/app/tailwind.config.ts`** — `brand` palette is the violet ramp; `warm` palette is unrelated to mobile's parametric tokens. Needs to be replaced with `acuity-*` color keys mapped to the canonical OKLCH ramp.
3. **`apps/web/src/app/globals.css`** — 10+ keyframes drive landing animations; needs pruning to the §6.3 web motion principles (fade-ups only, no constant ambient motion).
4. **`apps/web/src/app/insights/life-map.tsx`** — 33KB. Mixed token usage: `dark:bg-[#1E1E2E]` (close) but `dark:from-violet-950/30` and SVG `fill-violet-500` (drifted).
5. **`apps/web/src/app/insights/theme-map/page.tsx`** + force-graph component — force-directed graph is a different feature implementation than the orbital cosmos. Either port the orbital cosmos to web or document that web Theme Map is intentionally different.
6. **`apps/web/src/app/voice-journaling/page.tsx`** + **`/blog/[slug]/page.tsx`** — prose-invert article styling; ships a different dark color (`#0A0A0F`) than the rest of the marketing surfaces (`#181614`). Visual drift between articles and home.
7. **`apps/web/src/app/admin/layout.tsx`** — admin chrome on ultra-dark `#0A0A0F`. Outside the canonical system; document as an intentional internal-tooling exception or refactor.
8. **`apps/web/src/app/auth/signin/page.tsx`** + **`signup/page.tsx`** — different visual treatments. Signin is dark card on light bg; signup is dark-throughout split layout. Inconsistent post-click experience.
9. **`apps/web/src/app/onboarding/steps/*.tsx`** — repeated zinc text classes inline, no `<StepHeader>` / `<StepBody>` primitives. Brand circle hardcodes `border-[#7C5CFC]`.
10. **`apps/web/src/app/home/page.tsx`** — amber `border-amber-300 dark:border-amber-900/40` for PAST_DUE warnings. Should be `WARN_AMBER` (`#FBBF24`).

---

## 4. Component duplication report

The web app has effectively **zero** shared design-system primitives. Every screen rolls its own card, pill, button, header. Mobile has a 13-primitive set in `apps/mobile/components/acuity/`; web has no equivalent.

### 4.1 What web is rolling repeatedly

Patterns I counted ≥3 occurrences of:

| Pattern                                | ~Occurrences | Should be                              |
| -------------------------------------- | ------------ | -------------------------------------- |
| Theme pill (`bg-zinc-100 dark:bg-white/10 px-2 py-1 rounded-full text-xs`) | 5+ | `<ThemePill>`                          |
| Status badge (emoji + text)            | 4+           | `<StatusPill>` keyed off mood/priority |
| Section header (`text-xs uppercase tracking-widest text-zinc-400/500`) | 8+ | `<SectionHeader>`                     |
| Card wrapper (`border + bg + rounded-xl`) | 20+       | `<Card variant="default" \| "tinted">` |
| Goal card                              | 3+           | `<GoalCard>`                           |
| Task row                               | 3+           | `<TaskRow>`                            |
| Avatar / initial circle                | 2+           | `<Avatar>` (port from mobile)          |
| Subscription state pill                | 2 (in `/account`, `/home`) | `<SubscriptionPill>` (port from mobile) |
| Primary CTA button                     | 30+          | `<Button variant="primary">`           |
| Onboarding step shell                  | 10           | `<OnboardingStep>` with slots          |

### 4.2 Missing primitives to port from mobile

In rough priority order for web:

1. **`<Avatar>`** — initials circle with `gradMix` background (used in home greeting, profile, signin success).
2. **`<SubscriptionPill>`** — `PRO` / `TRIAL` / `FREE` states with the canonical Pro pill spec.
3. **`<ThemePill>`** — dot + label keyed off the 9 canonical theme hues.
4. **`<HeroCard>`** — gradient-backed card with corner blob, three variants (primary/secondary/mix). Used for hero blocks on home/insights.
5. **`<RingProgress>`** — for goal progress, weekly insight, Life Matrix overall score.
6. **`<SegmentedTabs>`** — used in insights for Theme Map / Matrix / Trends switching.
7. **`<GlassPill>`** — for floating top-bar pills (back, share, more) on detail screens.
8. **`<GradientText>`** — for the gradient hero numbers (scores, tier numbers).
9. **`<GradientCheckbox>`** — for task check + extract review.
10. **`<Sparkbar>` / `<Sparkline>`** — for entries 28-night heatmap, theme sparklines, weekly streak counts.

The remaining mobile primitives (`<AcuityTabBar>`, `<MiniRadar>`, `<TierPill>`) have less direct web demand or already have web equivalents — confirm during slice work, don't assume.

### 4.3 Where to put them

Suggested home: **`apps/web/src/components/acuity/`** mirroring the mobile barrel. Each component reads from CSS variables (or Tailwind theme extension keys) — never hardcode hex. Add an `apps/web/src/lib/theme/tokens.css` that defines the `:root[data-theme="dark"]` token block from `DESIGN_SYSTEM.md` §2.10.

### 4.4 Nav duplication

`<NavBar>` is rendered globally and `<LandingPage>` carries its own internal fixed nav overlay — both visible on `/`. The landing nav wins by z-index; NavBar bleeds through during scroll. Pick one and delete the other.

---

## 5. Onboarding flow audit

Web's signup → first-recording journey today is a **10-step `?step=N` query-controlled flow** at `/onboarding`. Each step is its own component under `onboarding/steps/`.

### 5.1 Current web onboarding (step-by-step)

| Step | Name                  | What's collected                                        | Visual state                              |
| ---- | --------------------- | ------------------------------------------------------- | ----------------------------------------- |
| 1    | Welcome               | None. Brand circle + "You're in" headline.              | Zinc-900 text on light, brand circle 2px `#7C5CFC` border. |
| 2    | What Acuity Does      | None. Three-beat value loop: talk → extract → patterns. | Geometric marks (dot, chevrons, bar chart). |
| 3    | Demographics          | First name, age range, therapist/coach use case, frequency. | Inputs use Tailwind defaults.            |
| 4    | Microphone Access     | OS permission. Soft gate (can skip).                    | OS-native modal; no custom styling.       |
| 5    | Practice Recording    | Live 10-second record + auto-stop. Discarded.           | Custom waveform animation, brand-purple ring. |
| 6    | Mood Baseline         | 5-point scale (Excellent → Terrible).                   | Simple radio list, zinc + emoji.          |
| 7    | Life Area Priorities  | **6 axes** (Health, Wealth, Relationships, Spirituality, Career, Growth) — multi-select. | Plain checklist. ⚠️ V1 vocab.           |
| 8    | Trial Explanation     | None. Copy: "14 days unlimited entries, one entry free forever." | Pricing-card aesthetic.                  |
| 9    | Notifications         | Nightly reminder time + days-of-week.                   | Time picker, day chips.                   |
| 10   | Ready When You Are    | CTA to first entry.                                     | Big primary CTA.                          |

Total: ~6–8 minutes. No paywall during flow (trial unlocks immediately).

### 5.2 Gaps vs. mobile + design intent

- **⚠️ Schema drift on step 7.** Mobile shipped Phase D — the 10-axis Life Matrix vocabulary (CAREER, MONEY, ROMANCE, FAMILY, FRIENDS, PHYSICAL_HEALTH, MENTAL_HEALTH, GROWTH, FUN, PURPOSE). Web onboarding step 7 still uses the **6-axis V1** vocabulary (Health, Wealth, Relationships, Spirituality, Career, Growth — note "Wealth" and "Spirituality" don't even map to the V1 enum in `@acuity/shared`). Two problems:
  1. Web is writing labels that aren't in the canonical V1 enum (`LIFE_AREAS_V1`: CAREER, HEALTH, RELATIONSHIPS, FINANCES, PERSONAL, OTHER). Either there's a translation layer hidden in the step component, or these are raw display strings not persisted to `UserOnboarding.lifeAreaPriorities`. Either way the web onboarding does not match the schema.
  2. The user gets a different vocabulary on web vs. mobile. Cross-stack confusion.
- **No introduction to the Theme Map.** Mobile users learn about Theme Map either through Insights tab discovery or through the v1.1 unlock copy ("4 more nights to unlock your Theme Map"). Web users never hear about it during onboarding. It surfaces in the signed-in `/insights` hub with no priming.
- **No introduction to the weekly report.** Per the sales-copy rubric: *the hero conversion driver is the weekly report, not the daily recording* (§7.2 of `Acuity_SalesCopy.md`). Web onboarding mentions trial entry counts but never previews the Sunday-morning artifact. This is a marketing-rubric violation as well as an onboarding-completion-rate risk.
- **Visual treatment is plain.** Step shells use Tailwind defaults (zinc-900 headings, zinc-400/500 body). No HeroCard, no GradientText for the axis name (mobile onboarding axis question renders the axis name in axis-hue gradient text), no MiniRadar preview.
- **Visual inconsistency with mobile onboarding.** Mobile spec (`screen-onboarding.jsx`) shows: 8-segment progress bar, eyebrow "Life Matrix · X of 12", display-30 question with gradient axis name, display-88 big score, hue-gradient slider track, MiniRadar preview card, "Next axis →" gradient CTA. Web has none of these elements — onboarding feels like a different product than the mobile shell users will land in.

### 5.3 What "good" looks like

Web onboarding should mirror mobile's Phase D 10-axis baseline carousel (which was built then **removed** in v1.1 due to friction). Two open questions for Jim:

1. Do we re-introduce the 10-axis baseline carousel on web only, or replace step 7 with a different value-prop screen?
2. Does step 7 stay a "priorities" picker (rank top 3 axes) or become a baseline scorer (rate each axis 0–100)?

These are product decisions, not design ones — flag for Jim before slicing.

### 5.4 Post-onboarding journey to first recording

Step 10 CTA → `/home`. From `/home`, the Record button → `/record` (or directly to native mobile flow if user is on iOS Safari). Web does not own the recording UI on desktop in a polished way — desktop users get a basic `<audio>` recorder. No design tokens applied. This is a known partial-implementation surface.

---

## 6. Feature exposure audit

Which mobile features does web expose, in what visual state?

| Feature                          | Mobile (Phase D/E)         | Web exposure                                              | Visual state vs. canonical              |
| -------------------------------- | -------------------------- | --------------------------------------------------------- | --------------------------------------- |
| Recording                        | Voice-reactive orb, gauge, waveform, gradient timer | `/home` "Record" button → desktop falls back to `<audio>`; mobile Safari delegates to native | **Stale / partial.** No web equivalent of orb-and-gauge. Desktop is functional minimum. |
| Entry detail (pull-quote, themes, tasks, transcript) | HeroCard pull-quote + theme pills + GradientCheckbox tasks | `/entries/[id]` | **Refreshed, drifted.** Has the data; pills are bespoke; no HeroCard pull-quote. |
| 10-axis Life Matrix radar        | Full radar with current+prior week polygons, biggest-moves rows, AI commentary | `/life-matrix` + `/home` mini | **On-parity vocab (10-axis), drifted visuals.** Uses Tailwind palette, not OKLCH; doesn't match mobile's radar chrome. |
| Theme Map                        | **Orbital cosmos** with 9 planets, dashed connectors, atmospheric gradients | `/insights/theme-map` | **Different implementation.** Web uses `force-graph-2d` force-directed canvas. This is a real feature divergence, not just a token gap. Either port the orbital cosmos to web (significant work) or document that web Theme Map is intentionally a different view of the same data. |
| Weekly Reports                   | Featured card on Home + Insights | Card on `/home` "Weekly Insight Section" + `/insights` | **Functional, visually dated.** Gradient cards look 2022-era. |
| Goals + Tasks                    | Goal cards with theme-hued rings, milestone footers | `/goals` + `/tasks` | **Functional, drifted.** No `<GoalCard>` primitive, no theme-hued progress rings, no milestone footer. |
| Quarterly State of Me            | Not in current mobile spec | `/insights/state-of-me` (web-only?) | **Web-only feature.** Mobile may not have shipped this. Confirm with Jim — if web-only intentional, document. |
| Health Correlations              | Not in mobile spec         | `/insights` metrics drawer (gated)                        | **Web-only / experimental.** Same flag. |
| Ask Your Past Self               | Not in mobile spec         | `/insights/ask`                                           | **Web-only.** |
| Sentiment band visualization     | Per-theme color (positive/neutral/challenging) | Internal extraction only, not surfaced in web UI | **Missing on web.** |
| 28-night heatmap                 | Entries list                | Not present on `/entries`                                 | **Missing.** |
| Achievement / tier system        | Home achievement strip + tier pill | Not present                                       | **Missing on web.** Web doesn't surface tier/achievements at all. |
| Streak floater (+1 animation)    | Home Streak tile           | Not present                                               | **Missing.** |
| Finish-day confetti              | Tasks → 0 open             | Not present                                               | **Missing.** |
| Profile + appearance picker (palette swap) | Profile screen      | Not present on web                                        | **Intentional — web doesn't expose accent picker per design system §2.1.** |

### 6.1 Feature-parity verdict

- **Data parity: 8/10 core mobile features are exposed in some form on web.** What's there works.
- **Visual parity: ~30%.** Most pages have the data + dark palette but none of the canonical primitives, the wrong brand color, and zero atmospheric treatment.
- **Marketing-to-app continuity: poor.** A user clicking a violet `#7C5CFC` ad lander, signing up via a violet form, and landing in a coral mobile app sees three different brands.

---

## 7. Highest-ROI surfaces to refresh first

Ranked. Reasoning for each.

### Tier 1 — Acquisition critical (do these first)

1. **Marketing landing `/` + `<LandingPage>` component** — every dollar of ad spend that converts on Meta lands here first. The current page violates the design system in every direction (brand color, font family, ambient glow, slogan-style headlines, three-adjective tricolons probably present in the hero). **Single biggest ROI lever.** Estimated effort: large — full hero rewrite, animation pruning, token migration, copy pass against the sales-copy rubric.
2. **`/auth/signup`** — the moment of intent. The split layout is decent; what fails is the violet brand color and the inconsistency with the post-signup mobile experience. Refresh as part of the landing pass for visual continuity. Estimated effort: small-medium (mostly token swap + Inter→system stack + button primitive).
3. **`/for/[slug]` AdLab landers + 5 static persona pages** — ad-cohort-specific landers. Highest conversion impact behind the homepage. Refresh after the homepage so they inherit shared primitives.
4. **Tailwind config + globals.css** — prerequisite work for any of the above. Replace `brand` palette with `acuity-*` keys mapped to OKLCH, prune `globals.css` animations to the §6.3 motion principles, swap fonts (Inter+Playfair → Manrope+system-stack+Geist Mono). This is foundation that unblocks everything.

### Tier 2 — Activation critical (post-signup retention)

5. **`/onboarding` flow** — first signed-in surface. Currently the biggest cross-stack mismatch (V1 6-axis on web vs. 10-axis on mobile, no Theme Map / weekly report priming, plain Tailwind chrome). Fix the schema drift first (urgent: web is writing data the canonical schema doesn't recognize), then refresh visuals to match mobile's onboarding chrome.
6. **`/home` dashboard** — the daily-return landing. The 7-card grid pattern is fine; the visual treatment isn't. Refresh after the canonical web primitives exist (Avatar, HeroCard, RingProgress, SubscriptionPill, ThemePill, Sparkbar).
7. **`/upgrade` paywall** — Day-14 conversion moment. Currently pragmatic-but-dated. Apply Accountability voice per `Acuity_SalesCopy.md` §8 and refresh chrome.

### Tier 3 — Engagement surfaces (after activation is stable)

8. **`/entries` + `/entries/[id]`** — daily-use surfaces for active users. Bring in HeroCard pull-quote, `<ThemePill>`, GradientCheckbox tasks. Add the 28-night heatmap from mobile.
9. **`/insights` hub** — the second-most-used signed-in surface. Heavy gradient-card style currently looks dated.
10. **`/insights/theme-map`** — **product decision needed first.** Either commit to porting the orbital cosmos to web (significant — needs SVG/canvas implementation, motion, gate logic) or document the force-graph as web-intentional. Until the decision lands, this is blocked.
11. **`/goals` + `/goals/[id]`** — feature-complete, visually drifted. Refresh after primitives exist.
12. **`/life-matrix`** — already on Phase D vocab; needs visual chrome refresh.
13. **`/tasks`** — small surface, low complexity, do alongside `/goals` refresh.

### Tier 4 — Lower priority / scoped exception

14. **`/account`** — account hub. Lower visual ambition; functional matters more than atmospheric.
15. **Legal pages (`/privacy`, `/terms`)** — token refresh for header/back-link consistency only. Body prose can stay plain.
16. **`/waitlist`** — still rendering pre-launch copy. Either retire (we shipped) or repurpose for a separate waitlist surface (Pro waitlist, family-plan waitlist, etc.). Flag for Jim.
17. **`/admin/*`** — internal tooling. Document the ultra-dark `#0A0A0F` palette as an intentional scoped exception, no refresh needed.
18. **`/voice-journaling` + `/blog/*`** — SEO pillar + blog. Lowest conversion priority but should still match the new dark token after the landing refresh, so users coming from organic search see the same brand.

### Suggested slice ordering

```
Slice 1: Foundation
  - Add apps/web/src/lib/theme/tokens.css with the canonical OKLCH ramp
  - Update tailwind.config.ts: replace `brand` palette with acuity-* keys
  - Swap fonts in app/layout.tsx (Manrope + system-stack + Geist Mono)
  - Prune globals.css to the §6.3 motion principles
  - Build apps/web/src/components/acuity/ barrel with Button, Card, ThemePill,
    Avatar, SubscriptionPill, SectionHeader

Slice 2: Marketing top of funnel
  - Refresh / hero + sections in landing.tsx (copy + tokens + animations)
  - Refresh /auth/signup
  - Refresh /auth/signin to match
  - Run sales-copy rubric checklist on everything that ships

Slice 3: Persona landers
  - Refresh 5 static /for/* pages
  - Update DynamicLandingPageView to consume new primitives

Slice 4: Activation
  - Fix /onboarding step 7 schema drift (V1 → V2 vocab decision needed first)
  - Refresh onboarding step shells using new primitives
  - Add weekly-report priming step or surface

Slice 5: Daily-use surfaces
  - Refresh /home, /entries, /entries/[id]
  - Add 28-night heatmap to /entries
  - Refresh /goals, /tasks

Slice 6: Insights
  - Refresh /insights hub
  - DECISION POINT: orbital cosmos on web yes/no
  - Refresh /life-matrix
  - Refresh /insights/ask, /insights/state-of-me, /insights/theme/[id]

Slice 7: Tail
  - /account, /upgrade
  - Legal pages token refresh
  - Retire or repurpose /waitlist
  - /voice-journaling + blog dark-mode reconciliation
```

Each slice is independent: foundation unblocks slices 2+, slices 2 and 3 ship together as one marketing release, activation (slice 4) can land in parallel, daily-use surfaces (slice 5) gate slice 6.

---

## 8. Open questions for Jim

Things I need explicit decisions on before slicing:

1. **Brand color direction.** Mobile defaulted to coral × violet (`gradMix`). Web's brand has been violet (`#7C5CFC`) since launch. Adopting coral on web means every marketing impression and every existing user's bookmark shows a different color overnight. Options:
   - (a) Migrate web to coral × violet to match mobile (clean parity, but visible brand jolt for existing audience).
   - (b) Keep web on violet, pivot mobile back to a violet-led palette (un-ships Phase D's coral default).
   - (c) Run mobile palette picker logic on web (acuity-*/coral/sunset/citrus/cobalt) — but the design system §2.1 says web ships coral only for v1.
2. **Web Theme Map.** Port the orbital cosmos to web, or document the force-graph as intentional?
3. **Web onboarding step 7.** Re-introduce a 10-axis baseline carousel (the one removed in mobile v1.1), or replace with a different value-prop step? Either way the V1 vocab needs to go.
4. **Weekly report priming during web onboarding.** Add a step that previews the Sunday-morning artifact? The sales-copy rubric says weekly report is the hero driver — onboarding should reinforce it.
5. **Recording UX on desktop web.** Polish the desktop recorder to match the mobile orb, or accept that desktop is functional-minimum?
6. **Waitlist page status.** Retire `/waitlist`, repurpose, or leave dormant?

Bring answers to slice 1 kickoff.

---

*End of v1 · 2026-05-22.*
