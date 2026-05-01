# Theme Extraction Quality — Phase 1 Investigation

**Status:** Investigation + proposal. **No code or schema changes proposed for execution yet.** Phase 2 (prompt iteration) starts after direction is approved.

**Hypothesis:** The current LLM extraction emits *event-level* themes ("Demo No-Shows", "Pre-Workout Routine", "Anniversary") rather than *dispositional patterns* that recur across entries ("things outside my control", "spectatorship vs doing", "powerlessness in fandom"). Pattern-level themes compound and make the Theme Map meaningful over time; event-level themes are mostly singletons and dilute the graph.

The audit below confirms the hypothesis with production data.

---

## 1. Production data audit

Run on prod DB at 2026-04-30. Script: `apps/web/scripts/theme-audit.ts`.

### Totals

| Metric | Value |
|---|---|
| Distinct Theme rows | 94 |
| ThemeMention rows | 139 |
| COMPLETE Entry rows | 50 |
| Users | 8 |

### Mentions-per-theme distribution

| Stat | Value |
|---|---|
| Median | **1** |
| p90 | 2 |
| p99 | 13 |
| Max | 13 |
| **Single-mention themes** | **73 / 94 = 80.2%** |
| Themes with ≥5 mentions | 4 / 94 = 4.4% |
| Themes with ≥10 mentions | 1 / 94 = 1.1% |

> **80%+ of themes are extracted exactly once.** That is the headline number. A graph designed to show *recurrence* across entries is being fed labels that almost never recur.

### Top 30 most-mentioned themes (across all users)

| # | Theme | User | Mentions | Bucket |
|---|---|---|---|---|
| 1 | work | cmohslow | 13 | **pattern** |
| 2 | family | cmohslow | 7 | **pattern** |
| 3 | sleep | cmohslow | 5 | **pattern** |
| 4 | weekend | cmohslow | 5 | temporal/event |
| 5 | golf | cmohslow | 4 | domain |
| 6 | stress | cmohslow | 4 | **pattern** |
| 7 | golf performance | cmnt026k | 4 | event/state |
| 8 | habit | cmohslow | 3 | **pattern** |
| 9 | kids | cmohslow | 3 | **pattern** |
| 10 | decision | cmohslow | 2 | **pattern** |
| 11 | self-awareness | cmnt026k | 2 | **pattern** |
| 12 | flow | cmohslow | 2 | **pattern** |
| 13 | exercise | cmohslow | 2 | domain |
| 14 | health | cmohslow | 2 | domain |
| 15 | evening | cmohslow | 2 | temporal/event |
| 16 | team | cmohslow | 2 | entity |
| 17 | social connection | cmnt026k | 2 | **pattern** |
| 18 | writing | cmohslow | 2 | activity |
| 19 | systems optimization | cmnqusst | 1 | event |
| 20 | setback | cmohslow | 1 | event |
| 21 | career growth | cmnqusst | 1 | event |
| 22 | task overload | cmnt026k | 1 | event/state |
| 23 | meetings | cmohslow | 1 | event |
| 24 | anniversary | cmohslow | 1 | event |
| 25 | self-awareness | cmnqusst | 1 | **pattern** |
| 26 | spring energy | cmnt026k | 1 | event |
| 27 | social plans | cmnt026k | 1 | event |
| 28 | product launch | cmnqusst | 1 | event |
| 29 | leg day reluctance | cmnt026k | 1 | event/state |
| 30 | burnout | cmohslow | 1 | **pattern** |

**Two distinct populations are visible:**
- **`cmohslow`** (likely seeded test data — short, pre-summarized one-liners): produces clean recurring patterns ("work", "family", "sleep", "stress").
- **`cmnt026k` / `cmnqusst`** (real users with longer, richer transcripts): produces event-level labels that don't recur ("demo no-shows", "leg day reluctance", "spring energy", "after-work plans", "pre-workout routine").

> The richer the transcript input, the more event-specific the extraction. The model is being too literal with the user's actual words.

### Per-user theme concentration (top users)

| Themes per user | User count |
|---|---|
| 39 | 1 |
| 30 | 1 |
| 25 | 1 |

`cmohslow`'s 39 themes against ~30 entries means roughly 1 new theme per entry, much of it never-recurring. That's exactly the explosion pattern.

---

## 2. Sample quality review — 20 random recent entries

Random sample from the last 30 days of COMPLETE entries. Each row classified by whether the extracted themes are **(a) pattern-level / dispositional**, **(b) entity- / event-level**, or **(c) mixed**.

| Entry date | Summary (truncated) | Extracted themes | Class |
|---|---|---|---|
| 2026-04-12 | Five meetings back-to-back. Got home with nothing left. | work, meetings, fatigue | **mixed** |
| 2026-04-23 | Restless night again. Phone in the bedroom. | sleep, energy | **pattern** |
| 2026-04-21 | Range session clicked. The new grip is doing something. | golf, morning, flow | **mixed** |
| 2026-04-23 | Hit a wall of task overload, leading to paralysis by analysis. | paralysis by analysis, task overload, focus & structure, self-awareness | **event** |
| 2026-04-09 | Anniversary dinner. The same booth, eight years later. | family, weekend, anniversary | **mixed** |
| 2026-04-17 | Took the kids to the park. No phone. Two hours, no agenda. | family, kids, weekend | **pattern** |
| 2026-04-27 | Cooked together, no screens. The kind of normal night I want more of. | family, kids, evening | **pattern** |
| 2026-04-02 | Distracted all day. Couldn't tell you what I shipped. | work | **pattern** |
| 2026-04-21 | Frustrating day with several no-show demos that disrupted momentum. | demo no-shows, product launch, user growth, diet & health, life chaos | **event** |
| 2026-04-23 | Pleasant day in Boston with warm weather. Looking forward to socializing. | social connection, nice weather, after-work plans | **event** |
| 2026-04-22 | Phone in the kitchen, lights off by 10:30. Slept seven hours. | health, habit | **pattern** |
| 2026-04-07 | Six hours, choppy. Functional but flat. | sleep | **pattern** |
| 2026-04-13 | Lifted at lunch instead of pushing through. | health, exercise | **pattern** |
| 2026-04-26 | Best round of the year — 78 at Briarwood. | golf, flow, weekend | **mixed** |
| 2026-04-15 | Played 18 with the old crew. The conversation was the point. | golf, weekend, friends | **mixed** |
| 2026-04-25 | Brief debrief mentioning karate and forehands. | martial arts, sports interest | **event** |
| 2026-04-20 | Wrote the launch announcement outline. Easier than I expected. | work, writing | **pattern** |
| 2026-04-23 | Pre-gym check-in capturing a decisive moment. | gym motivation, self-awareness, pre-workout routine | **event** |
| 2026-04-03 | Helped my son with math homework. | family, kids | **pattern** |
| 2026-04-11 | Read to the kids before bed. | family, evening | **pattern** |

| Class | Count | % |
|---|---|---|
| Pattern (all themes dispositional/recurring) | 9 | 45% |
| Event (all themes entity/state/situational) | 5 | 25% |
| Mixed | 6 | 30% |

The 45% "pattern" rate is misleading because it skews heavily toward `cmohslow`'s seeded short-summary entries. Of the 5 entries that came from real-user-style rich transcripts (the ones with multi-sentence summaries — `cmobhgk9`, `cmo97vkc`, `cmoblypd`, `cmoeowaj`, `cmobxar8`), **5 of 5 produced event-level themes.**

> Real-user input → event-level output, near-perfect correlation.

---

## 3. Current implementation

### 3.1 LLM prompt — `apps/web/src/lib/pipeline.ts:106-169`

Model: Claude (version from `CLAUDE_MODEL` in `@acuity/shared`).

The full schema block (line 110-157) defines `themes` as:

```json
"themes": [
  { "label": "short theme (1-3 words)", "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" }
]
```

The only theme-specific guidance is at **line 165**:

> Keep theme labels short (1-3 words). Per-theme sentiment reflects the user's emotional framing of that specific theme in this entry: POSITIVE if they expressed satisfaction/progress, NEGATIVE if strain/frustration, NEUTRAL if they mentioned it factually without strong valence. Up to 5 themes per entry.

**Problem:** "short (1-3 words)" steers the model toward concise *naming* of whatever's salient in *this entry*. There is no instruction to abstract, to find the recurring pattern under the surface event, or to reuse phrasing that would aggregate across entries. "Demo no-shows" satisfies "1-3 words" perfectly — and is exactly the wrong unit of analysis.

### 3.2 Processing — `apps/web/src/lib/themes.ts`

The dedupe path is **string-equal-after-normalization** on a `(userId, name)` unique key:

- `normalizeThemeName` (lines 48-74): lowercase, strip outer punctuation, collapse whitespace, conservative plural stem (`-ies → -y`, `-(ch|sh|ss|s|x|z)es → \1`). Notably *not* a general `-s → ∅` rule — comment at line 22-28 explains the deliberate trade-off (avoids "lens" → "len").
- `upsertTheme` (lines 97-109): `prisma.theme.upsert({ where: { userId_name } })`. No fuzzy match. No embedding match. No clustering.
- `recordMention` (lines 117-132): idempotent on `(themeId, entryId)`.
- `recordThemesFromExtraction` (lines 140-169): batch-applies upserts inside the calling transaction (called from `apps/web/src/inngest/functions/process-entry.ts:242-247`).

> "Demo No-Shows" and "demo no shows" deduplicate. "Demo No-Shows" and "Sales Pipeline Frustration" do not — even if they're the same dispositional pattern.

### 3.3 Schema — `prisma/schema.prisma:986-1014`

```prisma
model Theme {
  id        String         @id @default(cuid())
  userId    String
  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  createdAt DateTime       @default(now())
  mentions  ThemeMention[]
  @@unique([userId, name])
  @@index([userId])
}

model ThemeMention {
  id        String   @id @default(cuid())
  themeId   String
  theme     Theme    @relation(fields: [themeId], references: [id], onDelete: Cascade)
  entryId   String
  entry     Entry    @relation(fields: [entryId], references: [id], onDelete: Cascade)
  sentiment String   @default("NEUTRAL")  // POSITIVE | NEUTRAL | NEGATIVE
  createdAt DateTime @default(now())      // denormalized from Entry.createdAt
  @@unique([themeId, entryId])
  @@index([themeId, createdAt])
  @@index([entryId])
}
```

Also relevant: `Entry.themes` (`String[]`) — a legacy denormalized array that the weekly-report and digest pipelines still read instead of joining `ThemeMention`. Any redesign needs to handle both reads.

**There is no Entity / Topic / Tag / Pattern model.** The prior architectural decision (Theme Map route comments at `apps/web/src/app/api/insights/theme-map/route.ts:540-541`) was to keep one flat Theme namespace and "promote" categorization to a column once heuristics felt noisy. We're now at that point.

---

## 4. Two-tier proposal — Patterns + Entities

The headline shift: **what users currently get as "Theme" is a flat namespace conflating two different things.** Split them.

### 4.1 Conceptual model

| Tier | Cardinality | Examples | Decay | Used for |
|---|---|---|---|---|
| **Pattern** | Low (target: 8-25/user/year) | "things outside my control", "spectatorship vs doing", "powerlessness in fandom", "morning clarity", "decision avoidance" | None — patterns compound | Theme Map nodes, weekly report headers, insight prompts |
| **Entity** | Medium-high (50-200/user/year) | "Celtics game", "demo no-shows", "anniversary dinner", "leg day", "Boston weather", "kids" | Time-windowed; old entities fall off | Entry detail context, tag chips, search/filter |

Patterns are dispositional and recurring. Entities are concrete proper nouns or named events. The current single-namespace extraction is producing entities labeled as themes.

### 4.2 Two paths to get there

**Option A — Single prompt, structured output**
Same Claude call, change the schema:

```json
"themes": {
  "patterns":  [ { "label": "...", "sentiment": "..." } ],   // 1-3 per entry, dispositional
  "entities":  [ { "label": "...", "kind": "person|place|event|domain" } ]  // 0-N per entry
}
```

Prompt steers Claude to abstract the pattern, then list the entities separately. Lower latency, lower cost.

**Option B — Two-pass extraction**
Pass 1: existing prompt (entities + summary + tasks + goals).
Pass 2: a second Claude call that takes (today's transcript, last 30 days of patterns for this user) and asks: *"Which of these existing patterns does today's entry reinforce? Is there a new pattern emerging that recurs in 2+ recent entries?"*

Higher latency + cost, much better at catching cross-entry recurrence the per-entry call can't see. Pass 2 is the part that actually solves the recurrence problem — Pass 1 alone would still produce entity-flavored "patterns" because it has no cross-entry context.

> **Recommendation:** Option A for entity/pattern split, *plus* a lightweight Option B Pass 2 (run weekly, not per-entry) that promotes co-occurring entities into named patterns. Defer this design call to Phase 2.

### 4.3 Schema sketch (NOT for execution yet)

```prisma
// Existing Theme → repurpose as the Pattern tier
model Theme {
  id        String         @id @default(cuid())
  userId    String
  name      String
  // NEW: tier discriminant, default PATTERN for back-compat
  tier      String         @default("PATTERN")  // "PATTERN" | "ENTITY"
  // NEW: optional entity kind, only set when tier=ENTITY
  entityKind String?       // "person" | "place" | "event" | "domain" | null
  createdAt DateTime       @default(now())
  mentions  ThemeMention[]
  user      User           @relation(...)
  @@unique([userId, name])
  @@index([userId, tier])
}
```

Single-table inheritance keeps the migration trivial: backfill `tier=PATTERN` for everything that has ≥3 mentions, `tier=ENTITY` for the rest, then re-classify on next extraction. ThemeMention unchanged. Theme Map filters by `tier=PATTERN`. Entry detail shows entities as chips.

Alternative: separate `Entity` + `EntityMention` tables. Cleaner separation, more migration work, two extraction targets to maintain. Defer this decision to Phase 2.

### 4.4 UI implications

**Theme Map** filters to `tier=PATTERN`. The graph becomes navigable — fewer, more meaningful nodes. Mention threshold to unlock probably drops from 10 entries to ~5 because patterns surface earlier.

**Entry detail** gets a new "mentioned" chip row showing entities (Celtics, Boston, kids, etc.). These are useful for search/filter but don't deserve a node in the dispositional graph.

**Weekly Insight** prompt gets richer: "This week you wrote about *spectatorship vs doing* across 3 entries (Celtics, Boston demo, kids' game)" — the pattern is the headline, the entities are evidence.

### 4.5 Open questions for Phase 2

1. Do existing `Theme` rows migrate, or do we re-extract the last 30 days under the new prompt and let the old data age out?
2. Does the weekly-report pipeline read `tier=PATTERN` only, or both?
3. Pattern dedupe across entries — pure string equal will fail ("things outside my control" vs "powerlessness"). Embedding similarity? A second Claude pass that sees the user's existing patterns? Both?
4. Backwards compat for the legacy `Entry.themes: String[]` array — keep populating, or drop?

---

## 5. Out-of-scope confirmation

**The free-tier redesign work happening in parallel does NOT overlap with this work.**

- `apps/web/src/lib/paywall.ts` and `entitlementsFor` gate **whether extraction runs** (via `canRecord`), not **how it extracts**. No flag in entitlements touches the prompt, the processing, or the Theme schema.
- `git log --since="2 weeks ago"` shows zero commits touching `pipeline.ts`, `themes.ts`, `process-entry.ts`, the Theme Map UI, or the schema's Theme/ThemeMention models. The active areas are auto-blog, mobile App Store prep, dashboard layout, and trial-email orchestration. None overlap.
- The free-tier redesign (per current direction) operates at the gate layer. This work operates at the LLM prompt + schema layer. No shared files.

**Risk of merge conflict:** none of the files this proposal touches (`pipeline.ts`, `themes.ts`, `process-entry.ts`, `theme-map/route.ts`, `prisma/schema.prisma` Theme block) are in the free-tier work's blast radius.

---

## Phase 2 (proposed, awaiting approval)

1. Draft new prompt language. Bench against 10 anonymized real-user transcripts. Compare current output side-by-side.
2. Decide Option A vs A+B (pattern promotion pass).
3. Decide schema migration strategy (single-table vs split).
4. Ship behind a feature flag (`v1_1_two_tier_themes`) so rollback is one toggle.
5. Backfill or aged-out — your call after seeing Phase 2 prompt benchmarks.

**Nothing changes until you approve Phase 2 direction.**
