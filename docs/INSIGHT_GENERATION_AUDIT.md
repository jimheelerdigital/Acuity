# How insights, patterns, and weekly reports are generated today

**Date:** 2026-08-16
**Branch:** `feat/evidence-receipts`
**Purpose:** establish what actually produces each generated row, and from which inputs, before adding provenance. This is the "before" picture for the evidence-receipts work.

**Headline finding:** of the four generated artifacts, **only themes and people are traceable back to a source entry today.** The two most user-visible ones — `UserInsight` observations and `WeeklyReport` narratives — are generated from digests that *deliberately discard entry ids*, so there is no path from a displayed insight back to the recording it came from. That is the gap this track closes.

---

## 1. The four generated artifacts

| Artifact | Written by | Traceable to source entries today? |
|---|---|---|
| `UserInsight` | `inngest/functions/compute-user-insights.ts:209` | ❌ **No** — ids discarded in digest |
| `WeeklyReport` | `inngest/functions/generate-weekly-report.ts:202` | ❌ **No** — ids never selected |
| `Theme` / `ThemeMention` | extraction pipeline | ✅ Yes — `ThemeMention.entryId` |
| `Person` / `EntityMention` | extraction pipeline | ✅ Yes — `EntityMention.entryId` + offsets |

---

## 2. `UserInsight` — the weekly observation cron

**File:** `apps/web/src/inngest/functions/compute-user-insights.ts`
**Trigger:** cron `0 1 * * 0` (Sundays 01:00 UTC), `:118`
**Gate:** feature flag `claude_ai_observations`, `:122`
**Audience:** users with `subscriptionStatus in [TRIAL, ACTIVE, PRO]`, `:130`

### Two-layer pipeline

**Layer 1 — heuristic scanner** (`collectSignals`, `:227`). Produces `Signal[]` from four detectors:

| Detector | Lines | Inputs | Threshold |
|---|---|---|---|
| Area delta | `:240-274` | `LifeMapArea.score` vs `LifeMapAreaHistory` | `abs(delta) >= 20` |
| Theme spike | `:277-319` | `Entry.themes` this week vs prior week | `thisCount >= prevCount * 2`, min 2 |
| Streak milestone | `:322-340` | `User.currentStreak`, `lastStreakMilestone` | 7 / 30 / 100 |
| Mood drift | `:343-387` | `Entry.mood` → `MOOD_ORDER` rank average | `abs(drift) >= 1` band |

Each `Signal` carries `heuristicText` and a `context` object of machine-readable facts (`:69-76`). **Signals are per-detector aggregates — they never carry the entry ids they were computed from.** The theme-spike detector, for example, selects `{ themes: true }` only (`:284`).

**Layer 2 — Claude synthesis** (`synthesizeWithClaude`, `:446`). Sends `OBSERVATION_SYSTEM_PROMPT` (`:86`) plus a 14-day digest and the signal block; expects JSON `{observations: [{text, severity, linkedAreaId}]}`. Output is validated (`:498-514`): severity against a 3-value set, `linkedAreaId` against a 6-value set, text 10–200 chars, **max 3**.

**Fallback:** if Claude throws or returns nothing usable, the first 3 raw `heuristicText` strings are written with `generationModel: "heuristic"` (`:190-195`).

**Dedup:** rows whose `observationText` already appeared within 7 days are dropped (`:201-207`). Text-equality only.

**Write:** `prisma.userInsight.createMany` (`:209`) with `observationText`, `severity`, `linkedAreaId`, `generationModel`.

### Where traceability is lost

`buildDigest` (`:400`) is the whole context Claude sees. Its select (`:411-420`) is:

```
createdAt, summary, mood, moodScore, energy, themes, wins, blockers
```

**No `id`.** It then flattens each entry to a text line (`:427-439`) — `[date] mood=… themes=… "summary…"` — capped at 30 entries. So by the time Claude sees anything, the entries are anonymous strings. The returned observation cannot be attributed to any specific recording even in principle.

The docstring is explicit that this is deliberate: *"No transcripts (privacy + token cost) — just summaries, themes, moods, and aggregate stats."* Privacy and cost are legitimate reasons to withhold transcripts from the model — but neither requires discarding the **ids**, which is what actually prevents receipts.

### The fabrication path (motivates the task-5 rule)

`synthesizeWithClaude:452`, when the scanner found nothing:

> `"No strong mechanical signals this week — surface whatever pattern reads as meaningful from the digest alone."`

This instructs the model to produce a "pattern" with **zero** corroborating signal. Combined with there being no entry linkage, an observation on this path is unfalsifiable — nothing downstream can check it, and it is stored and displayed identically to a signal-backed one. `generationModel` distinguishes heuristic-vs-Claude but **not** grounded-vs-ungrounded.

This is the single highest-risk path for "show your receipts": the product would be claiming a pattern it cannot evidence.

---

## 3. `WeeklyReport` — the weekly narrative

**File:** `apps/web/src/inngest/functions/generate-weekly-report.ts`

- Placeholder row set to `GENERATING` (`:87`).
- Entry fetch (`:108`): `status: "COMPLETE"`, `entryDate` within `[weekStart, weekEnd]`, ordered ascending. Select (`:118-127`) is `entryDate, mood, moodScore, energy, summary, themes, wins, blockers` — **again no `id`**.
- Guard: `< 3` entries → `NonRetriableError` (`:130`).
- Claude call at `:177`; result written back at `:202` into `narrative`, `insightBullets`, `moodArc`, `topThemes`, plus counters.

`WeeklyReport.insightBullets` is a `String[]` (`schema.prisma:1021`) — free text with no structure to hang provenance on. Same gap as `UserInsight`, one level less granular.

---

## 4. Themes — already traceable ✅

`Theme` (`schema.prisma:1630`) is per-user, unique on `[userId, name]`.
`ThemeMention` (`:1642`) links `themeId` → `entryId`, unique on `[themeId, entryId]`, carries `sentiment` and a `createdAt` denormalized from the entry.

**This is the existing precedent for what evidence should look like**, and it's why "recurring themes" can be shown with receipts today while "insights" cannot.

Note the redundancy: `Entry.themes` is *also* a denormalized `String[]` (`schema.prisma:719`), and the insight scanner reads that array (`:284`) rather than `ThemeMention`. So the one traceable structure that exists is bypassed by the code that most needs it.

---

## 5. People — already traceable ✅

`Person` (`schema.prisma:2605`): `canonicalName`, `aliases[]`, `mentionCount`.
`EntityMention` (`:2628`): `entryId` + `mentionText` + **`startIndex` / `endIndex` / `context`**.

`EntityMention` is the closest existing model to what task 2 needs: an id link *plus* character offsets *plus* a stored excerpt. The new evidence table mirrors this shape deliberately.

---

## 6. Inputs available for provenance

| Source | Field | Notes |
|---|---|---|
| `Entry` | `id`, `transcript`, `summary`, `themes[]`, `embedding`, `entryDate`, `status` | `transcript` is nullable; excerpts must tolerate null |
| `ThemeMention` | `entryId`, `sentiment` | ready-made theme evidence |
| `EntityMention` | `entryId`, `startIndex`, `endIndex`, `context` | ready-made person evidence |
| `Signal.context` | per-detector facts | numeric backing for heuristic insights |

The heuristic detectors *could* all cite entries — the data is right there in the queries — they simply don't select ids. That makes retrofitting provenance a change to what is selected and carried through, not a redesign.

---

## 7. What this track adds

1. `InsightEvidence` join table — insight → entry, with excerpt + offsets, mirroring `EntityMention`.
2. `UserInsight.confidence` + evidence-derived tier.
3. Correction state on `UserInsight`.
4. A confidence rule making **zero evidence ⇒ never a confirmed pattern**, independent of what the model claims.
5. A read-only Memory Ledger aggregating the traceable structures above.

All additive, all behind `EVIDENCE_RECEIPTS` (default off). Generation behavior with the flag off is byte-identical to today.
