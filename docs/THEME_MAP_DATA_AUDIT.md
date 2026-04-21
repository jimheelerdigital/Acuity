# Theme Map — Data Audit

Written 2026-04-20 as the pre-implementation audit for Sprint 2's Theme Evolution Map. Purpose: determine whether today's theme data can power a force-directed graph with per-theme sentiment + co-occurrences, and what migration is needed to get there.

## 1. Current state

### Storage

Themes live in five places, all derived from the same extraction call:

| Location | Shape | Notes |
| --- | --- | --- |
| `Entry.themes` | `String[]` | Flat, max 5, no metadata. Primary source. |
| `Entry.rawAnalysis.themes` | `string[]` | JSON mirror, same data. |
| `WeeklyReport.topThemes` | `String[]` | 3–5 per week, AI-synthesized for the report narrative. |
| `LifeMapArea.topThemes` | `String[]` | Up to 5 per area per user, merged via `Set` in `lib/memory.ts:318` (case-sensitive dedup). |
| `UserMemory.recurringThemes` | `Json[]` | `{ area, theme, firstSeen, count, lastSeen }`. Lowercase keys for dedup, original casing preserved in the `theme` field — so "Stress" and "stress" resolve to the same key but the display form is whichever arrived first. Top 50 only. |

### Extraction path

Pipeline entry points:
- Async: `apps/web/src/inngest/functions/process-entry.ts:199` → writes `extraction.themes` onto `Entry`.
- Sync (legacy): `apps/web/src/lib/pipeline.ts:258` → same.

Both call `extractFromTranscript()` in `pipeline.ts:177`, which uses `EXTRACTION_SYSTEM_PROMPT` (`pipeline.ts:93–139`). The prompt asks for:

```json
"themes": ["theme1", "theme2"]
```

— flat `string[]`, capped at 5 by `ensureStringArray(parsed.themes).slice(0, 5)`. **No per-theme sentiment.** Sentiment exists only at the life-area level (`lifeAreaMentions[area].sentiment`, one value per area per entry).

### Aggregation already in the codebase

- **`compute-user-insights.ts:120–161`** — week-over-week theme frequency; lowercases before bucketing; fires an insight when `thisCount ≥ prevCount × 2`.
- **`lib/memory.ts:407–440`** (`updateRecurringThemes`) — lifetime mention counts, area-keyed.
- **`generate-weekly-report.ts`** — the narrative prompt receives `Entry.themes` per entry, outputs its own 3–5 `topThemes`.
- **`generate-life-audit.ts`** + `lib/prompts/life-audit.ts` — themesArc (starting / emerging / fading).

### Normalization

None. There is no `normalizeTheme()` utility. Case-sensitive equality drives every read path except `UserMemory.recurringThemes` (lowercase key only) and `compute-user-insights` (lowercase key only). Plural/singular variants ("stress" vs "stresses" vs "stressed") produce distinct rows.

### Sentiment per theme

Not captured. Claude is asked for sentiment per life area, not per theme. To get per-theme sentiment we need either:
1. a prompt change to return `{ label, sentiment }[]` per theme, or
2. an inference heuristic that maps the owning life-area's sentiment onto the theme (imprecise — one entry may have a "positive career" mention and a "negative health" mention, and the same theme might appear in both).

Option 1 is the cleaner path; the prompt size change is a few tokens.

## 2. What's missing for the Theme Map

| Requirement | Present? | Gap |
| --- | --- | --- |
| Themes linked to specific entries | Yes, via `Entry.themes` | None |
| Per-theme sentiment | **No** | Prompt update + persistence model |
| Normalized theme identity (case + plurals) | **No** | Utility + dedup at write time |
| Co-occurrence queries (theme pair in same entry) | Derivable but expensive | Scan all `Entry.themes` arrays, compute pairs on every query. A dedicated join table makes this a `GROUP BY theme1_id, theme2_id` lookup. |
| Time windows for "4 weeks ago" / "last month" | `Entry.createdAt` already there | Queries must go through Entry join, so every theme-map API call pays the join cost. A `ThemeMention.createdAt` column (denormalized from Entry) avoids it. |

## 3. Proposed migration

Two new models. Both are **additive only** — no rename, no drop, no type change. The existing `Entry.themes String[]` field stays as-is (used by weekly reports, life audits, the insight cron). We layer the relational model alongside.

```prisma
// One row per distinct normalized theme-name per user.
model Theme {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // Normalized: lowercase, trimmed, whitespace-collapsed, common plurals
  // stemmed. See lib/themes.ts::normalizeThemeName.
  name      String
  createdAt DateTime @default(now())
  mentions  ThemeMention[]

  @@unique([userId, name])
  @@index([userId])
}

// One row per (theme, entry) pair. Denormalized createdAt mirrors the
// Entry for faster time-window queries — cuts the Entry join out of the
// graph-building query path.
model ThemeMention {
  id        String   @id @default(cuid())
  themeId   String
  theme     Theme    @relation(fields: [themeId], references: [id], onDelete: Cascade)
  entryId   String
  entry     Entry    @relation(fields: [entryId], references: [id], onDelete: Cascade)
  // "POSITIVE" | "NEUTRAL" | "NEGATIVE"
  sentiment String   @default("NEUTRAL")
  createdAt DateTime @default(now())

  @@unique([themeId, entryId])
  @@index([themeId, createdAt])
  @@index([entryId])
}
```

Entry gets a back-relation so cascade delete cleans up mentions when an entry is deleted:

```prisma
model Entry {
  // ... existing fields
  themeMentions ThemeMention[]
}
```

User likewise:

```prisma
model User {
  // ... existing fields
  themes Theme[]
}
```

### Helper module

`apps/web/src/lib/themes.ts`:

- **`normalizeThemeName(raw: string): string`**
  - lowercase
  - trim
  - collapse whitespace runs to single space
  - strip common trailing plurals where the singular is still a word: `stresses → stress`, `worries → worry`, `goals → goal`, `projects → project`. Keep it conservative — "mass" and "kids" should not lose their 's'. Use a tiny explicit suffix table rather than a stemmer; we're not trying to build Porter.
  - strip leading/trailing punctuation
  - return "" for inputs that normalize to empty (caller drops those)
- **`upsertTheme(userId, rawName): Promise<Theme>`** — find-or-create keyed on `(userId, normalized)`.
- **`recordMention(themeId, entryId, sentiment, createdAt): Promise<ThemeMention>`** — idempotent upsert on `(themeId, entryId)`.

### Extraction pipeline change

Update `EXTRACTION_SYSTEM_PROMPT` to return sentiment per theme:

```jsonc
"themes": [
  { "label": "stress", "sentiment": "NEGATIVE" },
  { "label": "morning runs", "sentiment": "POSITIVE" }
]
```

Parser: accept BOTH shapes for a transitional period — the new `{ label, sentiment }[]` form AND the legacy `string[]` form. Legacy maps to sentiment `NEUTRAL`. This is belt-and-suspenders against a stale deploy where an in-flight Claude call was issued before the prompt update took effect.

After extraction, both the async (`process-entry.ts`) and sync (`pipeline.ts`) paths:

1. still write `Entry.themes: String[]` using `theme.label` values (existing readers unchanged).
2. additionally call `upsertTheme` + `recordMention` for each theme.

The transaction boundary: keep these inside the same transaction as the `Entry` update so a failed mention write doesn't leave a half-populated state. If the mention writes throw, the entry status goes to `PARTIAL` (same pattern already used for `lib/memory.ts` failures).

## 4. Backfill strategy

### Scope

Every existing `Entry` row with `status = COMPLETE` and a non-empty `themes` array. No audits, no re-extractions. The backfill reads `Entry.themes` (already on disk) and projects it into the new relational shape.

### Sentiment for backfilled rows

Existing entries never captured per-theme sentiment. Options:

1. **Default to NEUTRAL for all backfilled mentions.** Honest about data we don't have. The Theme Map graph will show backfilled themes as grey nodes; new mentions (post-prompt-update) will be green/red as they arrive. Over a few weeks the graph tints naturally.
2. **Inherit from `Entry.rawAnalysis.lifeAreaMentions` where the theme appears in that area's `themes[]`.** More accurate per individual theme but surprising: a theme in both a "positive career" and "negative relationships" entry gets assigned to whichever area the extractor happened to list it under first.

Going with **option 1** (NEUTRAL). Cleaner provenance, avoids a backfill bug where the sentiment attribution depends on extraction ordering.

### Script properties

- Idempotent: uses `ThemeMention` composite unique `(themeId, entryId)` so re-runs are no-ops.
- Batched: pages through entries in chunks of 200.
- Progress logs: `Processed N/M entries, upserted T themes, M mentions`.
- Manual-run only (no cron hook). Documented in README / morning report.

## 5. Open questions for Jim

1. **Singular-from-plural stemming.** The suffix table above is the smallest rule that works for "stress"/"stresses". If we want real stemming ("running" ↔ "run"), that's a Porter implementation or a dependency. Recommendation: ship the suffix table, revisit if users report obvious duplicates.
2. **Theme-graph size ceiling.** With 500 entries × 5 themes each, a user could have ~2,500 ThemeMention rows. Unique themes is bounded much tighter (long-tail distribution — first 20 themes cover ~80% of mentions). Node count on the force graph should be capped at e.g. top-50 by mention-count per window to keep the canvas readable. Implementation note for E.4.
3. **Prompt update rollout.** The prompt change is a write-amplified deploy: until Vercel swaps, old extractions still return `string[]`. The dual-shape parser absorbs this. Worst case during the rollout: a few entries get NEUTRAL sentiment despite the user's actual tone. Acceptable.
