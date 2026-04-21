# Acuity Roadmap

Written 2026-04-20 alongside the Sprint 1 retry that shipped goals detail, demographics, reminders, Life Matrix trend toggle, auto-flagged observations, comparisons, and tiered recommended activities.

This doc is **forward-looking only** — shipped work lives in git history and `PROGRESS.md`. The goal of this file is to keep the shape of upcoming sprints legible without coupling to a specific ticket tracker.

## Sprint 2

Focus: two flagship features (Theme Evolution Map + Goal Progression Tree) plus a cross-cutting "Loop" layer that ties goals to the daily recording flow more directly.

### Theme Evolution Map

A force-directed graph of themes the user has mentioned over time.

- **Nodes** — themes extracted from entries (same `Entry.themes` source currently feeding weekly reports + tier-2 recommendations).
- **Visual encoding** — size = frequency, color = sentiment (positive → violet, neutral → grey, concerning → amber).
- **Edges** — co-occurrence within a single entry (co-mentioned themes form an edge; edge thickness = co-occurrence count).
- **Time controls** —
  - Window dropdown: last week / month / 3 months / 6 months / year / all.
  - Timeline slider to scrub the window through history.
  - "Today" button snaps back to the current window.
- **Detail on tap** — show entries that mentioned the theme + a trend line over the window.
- **Surfaces** —
  - Web: new `/insights/theme-map` route.
  - Mobile: new tab within the Insights screen (likely a secondary toggle alongside Life Matrix).

Implementation notes:
- Force-directed layout library: `d3-force` on web; likely `react-native-svg` + a JS port of `d3-force` on mobile. WebView is a last resort.
- Theme aggregation probably wants a materialized view or periodic rollup into a `ThemeOccurrence` table. Inline aggregation of every Entry.themes across >1k entries is too slow to run synchronously.
- Sentiment color depends on either a per-theme sentiment score (new column) or a theme-to-area lookup that inherits sentiment from the Life Matrix area the theme maps to.

### Goal Progression Tree

A hierarchical tree view on the Goals page replacing the flat list.

- **Parent goals** branch to **sub-goals** which branch to **tasks and reflections**.
- **Self-referential** — `Goal.parentGoalId` (nullable FK back to Goal).
- **Auto-building** — when the user records a reflection tagged to a goal, extracted sub-items (tasks, sub-goals) attach as children of that parent goal automatically.
- **Progress roll-up** — sub-goal completion contributes to the parent's progress. A parent with 4 sub-goals at 25%/50%/75%/100% reads as 63%.

Implementation notes:
- Schema: `Goal.parentGoalId`, plus index `@@index([parentGoalId])`.
- Extraction pipeline needs to understand the parent-child relationship when a reflection names an existing goal — most likely by prompting Claude to identify "which existing goal is this update about?" and then attaching any extracted sub-items.
- UI: D3 tree or a simple nested list with indent + tree connector lines.

### The Loop: goal-driven recording

A light product layer that uses goals to drive the daily recording experience.

- The recommended activities card already surfaces goal-based prompts at tier 1 (shipped in Sprint 1). The Loop extends this to:
  - **Weekly check-ins** — "You said you'd run 3x this week. How did that go?" — scheduled by the weekly report generator or a new Inngest cron.
  - **Session framing** — when the user taps a "Record about this goal" CTA, the recording screen shows the goal title + last reflection at the top so the user anchors their speech.
  - **Reflection-to-progress** — extracting specific progress values from a reflection ("I ran twice this week") auto-nudges `Goal.progress`.

---

## Sprint 3

Focus: long-form reflective surfaces that build on accumulated data.

### Life Timeline

A chronological story of the user's life in Acuity, zoomable from day level all the way to year.

- Think Apple Photos' year/month/day spatial zoom, but for entries + key life events.
- **Day view** — each entry's summary + mood emoji + linked tasks/goals.
- **Month view** — mood arc heat strip, top themes bubble chart, key entries flagged (streak starts, milestones, Life Audit dates).
- **Year view** — narrative timeline of significant shifts (score inflections, goal completions, Life Audit generations).
- Good context for the Day 365 Annual Audit flagship feature.

### Ask Your Past Self

Semantic search over the user's own entries, answered in their voice.

- **Input** — free-text question: "When did I last feel stuck on career stuff?" / "What have I said about my dad?"
- **Retrieval** — vector embedding search over entry summaries + transcripts. Likely `pgvector` extension (we're already on Supabase Postgres).
- **Answer** — Claude synthesizes the top-k matching entries into a natural-language answer with source citations (entry date + summary snippet, click-through to full entry).
- Privacy-critical surface: the prompt must never leak search intent to the model provider in a way that lets it cluster users. Options: (a) local embeddings before retrieval, (b) Anthropic's zero-retention endpoints for the synthesis call.

---

## Further out (Sprint 4+)

Ordered roughly by expected value; not committed dates.

- **Calendar integrations** — Outlook, Gmail, Apple Calendar. Reads upcoming events so the dashboard can say "Your 2pm with Sarah is coming up — anything you want to note?"
- **Referral program** — 30-day credit for each signup that converts to paid.
- **Apple Health integration** — ingest sleep + HRV + workouts as optional context for the health area score. Very privacy-sensitive; must be fully opt-in with clear data-sharing copy.
- **Configurable Life Matrix parameters** — let advanced users rename the 6 areas, adjust baselines, or add a 7th custom axis.
- **Relationship Map** — privacy-sensitive. A visualization of named people across the user's entries, with sentiment + mention count. Must default to on-device only; the server never sees the graph unless the user opts in.
- **State of Me report** — quarterly long-form (like the Day 14 Life Audit but continuous). Fed by the Life Timeline + all flagship data sources.
- **Android app** — Expo already supports it; the blockers are design polish, EAS build profiles, and Play Store setup. Most of the app will work out of the box since the code is cross-platform already.

---

## Not on the roadmap

For clarity on what's been considered and declined:

- **Social features / sharing** — Acuity is a private tool. Adding share graphs erodes the "you're talking to yourself" premise.
- **Real-time AI conversation** — would require an entirely different product model (chat-first instead of journal-first). Separate product, not a feature.
- **Third-party integrations beyond calendar/health** — kept narrow intentionally. The value is the AI reading *your* words, not aggregating from everywhere else.
