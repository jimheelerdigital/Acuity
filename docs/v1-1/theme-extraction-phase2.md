# Theme Extraction — Phase 2: Prompt Iteration

**Status:** Phase 2 complete. **Recommendation: ship V5.** No code or schema changes have been made; the live extraction pipeline is unchanged. This doc captures the prompt iteration, side-by-side sample outputs, and the recommended ship version. Phase 3 (production deploy + schema migration to add the Entity tier) waits on Jim's approval.

**Method:** New harness at `apps/web/scripts/theme-prompt-bench.ts` pulls the same 20-entry sample from production used in Phase 1, sends each transcript (raw, not summary) through every candidate prompt in parallel via `claude-sonnet-4-6`, and emits a JSON comparison. Output summarized in `/tmp/bench-iter{1,2,3}-summary.txt` during the run.

---

## TL;DR

| Variant | Total themes | Distinct | Avg/entry | Zero-theme entries | Themes recurring ≥2× |
|---|---|---|---|---|---|
| V0 baseline (current prod prompt) | 78 | **75** | 3.90 | 0 | 1 |
| V3 recurrence test | 32 | 29 | 1.60 | 1 | 3 |
| V4 canonical shapes | 20 | 18 | 1.00 | 2 | 2 |
| **V5 final (V3 + V4 merge)** | **26** | **19** | **1.30** | **2** | **6** |

V0 produces ~75 unique labels across 20 entries — exactly the recurrence problem from Phase 1. V5 produces 19 distinct labels, of which 6 recur 2-3× *within just 20 entries*, plus a "defending K" family (3 variants of the same pattern). Recurrence ratio: 1.04 mentions/distinct under V0, **1.37 under V5** — small in absolute terms, large in trajectory: at the 200-entry scale, V5 should produce a graph users can actually navigate.

---

## 1. Iteration history

### V0 — baseline (current production prompt)

The theme block from `apps/web/src/lib/pipeline.ts:165`, reproduced standalone for the bench:

> Keep theme labels short (1-3 words). Per-theme sentiment reflects the user's emotional framing of that specific theme in this entry: POSITIVE if they expressed satisfaction/progress, NEGATIVE if strain/frustration, NEUTRAL if they mentioned it factually without strong valence. Up to 5 themes per entry.

**Behavior:** every theme is event-level. "Demo No-Shows", "Mike's career", "Telling Keenan", "Pre-Workout Routine". 75/78 distinct → near-zero recurrence. Confirms Phase 1's read.

### V1 — pattern-first

First reframe. Define dispositional patterns vs event-level entities, give 6+ examples of each. Cap at 1-3 themes per entry.

**Result (iter 1):** 25 themes / 23 distinct / 1.25 per entry. "presence with family" already recurring across 3 entries. Major improvement, but a few entries still got slightly event-flavored output ("physical skill identity" for the karate entry — should have been empty).

### V2 — two-step

Adds an explicit internal "name the surface event, then name the underlying pattern, return only the pattern" instruction. Hypothesis: forcing Claude to articulate the event first makes it easier to step past it.

**Result (iter 1):** 22 themes / 18 distinct / 1.10 per entry / 2 zero-theme entries (correct: the karate one-liner and a single short reflection). Comparable to V1 but slightly more disciplined. Pattern-first framing not yet as crisp as it could be.

### V3 — recurrence test

V2 plus a hard "recurrence test" the model must apply to each candidate: *"Could this same label honestly fit an entry six months from now about a completely different domain?"* Plus 9 example patterns and 9 explicit anti-examples.

**Result (iter 1):** 31 / 28 / 1.55 / 1 zero-theme. Best recurrence so far (3 themes appear ≥2×). Still picks a few slightly verbose labels ("rebuilding discipline after slippage").

### V4 — canonical shapes

V3 plus a CANONICAL SHAPES block: 10 reusable framings ("X compounding", "Y without explanation", "Z over W", "defending K", "presence with M", "rules I break", "X as Y lever", "noticing X", "intention without follow-through", "showing up X"). Plus an explicit no-proper-names rule (V0 leaked "Telling Keenan" and "Mike's career"; V3 didn't but had no explicit guard). Cap at 0-2 themes (down from 0-3).

**Result (iter 2):** 20 / 18 / 1.00 / 2 zero-theme. Most disciplined output of any variant — every label is a clean dispositional pattern. **But:** went too sparse. Cut multi-pattern signals from rich entries (e.g. anniversary dinner had both "intention without follow-through" + "presence with family" in V3, only the first in V4).

### V5 — final candidate (V3 + V4 merge)

V3's structure (two-step, recurrence test, 0-3 themes per entry) + V4's two strongest additions: the canonical-shapes block and the explicit no-proper-names rule. Restores multi-theme output for rich entries.

**Result (iter 3):** 26 / 19 / 1.30 / 2 zero-theme. **Best recurrence of any variant** — 6 patterns recur 2× or 3× across the 20 entries, plus a "defending K" family of 3 variants that would canonicalize cleanly downstream.

V5 prompt body is checked into `apps/web/scripts/theme-prompt-bench.ts` (search `V5_FINAL`). Reproduced in §3 below.

---

## 2. Side-by-side: same 20 entries, V0 vs V5

| Entry | Date | Current DB (V0 prod) | V5 final |
|---|---|---|---|
| cmohslpz | 04-27 | family / kids / evening | **presence over productivity** |
| cmohslqd | 04-26 | golf / flow / weekend | **small changes compounding into confidence** |
| cmoeowaj | 04-25 | Martial Arts / Sports Interest | **(empty)** ← correct, one-line entry |
| cmohslr4 | 04-23 | sleep / energy | **rules I break for myself · sleep as performance lever** |
| cmobxar8 | 04-23 | Gym Motivation / Self-Awareness / Pre-Workout Routine | **defending the window** |
| cmoblypd | 04-23 | Social Connection / Nice Weather / After-Work Plans | **(empty)** ← arguable; richer prompts could pick "seeking reconnection" |
| cmobhgk9 | 04-23 | Paralysis by Analysis / Task Overload / Focus & Structure / Self-Awareness | **volume triggering inaction** |
| cmohslzs | 04-22 | health / habit | **boring fundamentals compounding** |
| cmohslrh | 04-21 | golf / morning / flow | **early effort compounding into flow** |
| cmo97vkc | 04-21 | Demo No-Shows / Product Launch / User Growth / Diet & Health / Life Chaos | **outcome without closure · many fronts at once** |
| cmohslru | 04-20 | work / writing | **clarity over cleverness** |
| cmohslsy | 04-17 | family / kids / weekend | **noticing what restores me · presence with family** |
| cmohsltb | 04-15 | golf / weekend / friends | **presence over performance** |
| cmohslu2 | 04-13 | health / exercise | **movement as cognitive fuel** |
| cmohsluf | 04-12 | work / meetings / fatigue | **defending calendar from depletion · intention without follow-through** |
| cmohsluv | 04-11 | family / evening | **defending time with family · noticing what restores me** |
| cmohslvm | 04-09 | family / weekend / anniversary | **presence over productivity · intention without follow-through** |
| cmohsm0l | 04-07 | sleep | **sleep as performance lever · rules I break for myself** |
| cmohslxi | 04-03 | family / kids | **presence with family** |
| cmohslxv | 04-02 | work | **reactive over deep work · intention without follow-through** |

**Recurrence in V5 across these 20 entries:**

| Pattern | Entries |
|---|---|
| intention without follow-through | 3 (cmohsluf, cmohslvm, cmohslxv) |
| sleep as performance lever | 2 (cmohslr4, cmohsm0l) |
| rules I break for myself | 2 (cmohslr4, cmohsm0l) |
| presence with family | 2 (cmohslsy, cmohslxi) |
| presence over productivity | 2 (cmohslpz, cmohslvm) |
| noticing what restores me | 2 (cmohslsy, cmohsluv) |
| **"defending K" family** (cluster) | 3 variants — defending the window, defending calendar from depletion, defending time with family |

Six patterns each appear in 2-3 entries. The "defending K" cluster is three distinct surface phrasings of the same underlying pattern; with a downstream embedding-similarity step (Phase 3 work) these would collapse to a single graph node. Even without that step, "defending" appears as a substring across all three so simple display-time grouping is plausible.

**The current production prompt produces zero of these patterns.**

---

## 3. Recommended ship version (V5) — full text

```
You are Acuity's pattern-extraction engine. Read the user's nightly voice debrief and identify the dispositional patterns underneath.

A pattern is something that would plausibly recur across this user's future entries about completely different topics. Patterns describe HOW the user shows up — disposition, posture, recurring tension or strength — not WHAT happened today.

Internal two-step (do not include in output):
1. Surface: what literally happened today (1 short phrase).
2. Pattern: the dispositional reading. Apply the RECURRENCE TEST: "Could this same label honestly fit an entry six months from now about a completely different domain (e.g. work vs family vs health vs hobbies)?" If no, drop the candidate.

Prefer these CANONICAL SHAPES — they describe dispositions and recur cleanly across users and topics:
- "X compounding" / "X compounding into Y" — small disciplined acts adding up
- "Y without explanation" / "Y without closure" — receiving outcomes without clarity
- "Z over W" — choosing one orientation over another ("connection over performance", "presence over productivity", "clarity over cleverness", "reactive over deep work")
- "defending K" — protecting time, energy, or attention from drift
- "presence with M" — being undivided with people
- "rules I break for myself" / "rules I break repeatedly" — gap between intent and action
- "X as Y lever" — recognizing what changes what ("sleep as performance lever", "movement as cognitive fuel")
- "noticing what restores me" / "noticing my own avoidance" — meta-awareness of self-state
- "intention without follow-through" — recurring inability to execute on stated plans
- "showing up tired" / "showing up scattered" — recurring posture under load

You are not limited to these shapes — they're examples of dispositional, reusable framings. New patterns are fine if they pass the recurrence test and would describe a disposition rather than an event.

DO NOT return:
- Proper names of people, places, products, sports, hobbies, or domains. "Celtics", "Briarwood", "Keenan", "Mike", "golf", "karate", "demo", "anniversary" are entities — they belong in entity extraction (a separate pipeline), not in themes. If a person's name comes to mind, replace with the role they play in the pattern ("confronting a colleague" → "asserting a boundary").
- Today-specific phrases. "Demo no-shows", "leg day reluctance", "anniversary dinner", "nice weather" are events. Drop them.
- Generic abstractions like "self-awareness", "productivity", "wellbeing", "fulfillment". Reframe as the specific dispositional posture ("noticing my own performing", "reactive over deep work").

Return JSON:

{
  "themes": [
    { "label": "dispositional pattern (2-5 words)", "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" }
  ]
}

Rules:
- 0-3 themes per entry. Two themes is common when the entry is rich enough to expose a disposition + a recurring tension. One theme is fine for sparse entries. Empty array IS valid output for a single-line entry where no pattern emerges. Never pad to fill a quota.
- Sentiment: POSITIVE = a strength being leaned into; NEGATIVE = friction or frustration with the pattern; NEUTRAL = mentioned without strong valence.
- Lowercase labels except where genuinely required by grammar.
- Reuse is the goal — when a familiar pattern fits, prefer the familiar phrasing over inventing a new one.

Return ONLY valid JSON. No markdown, no prose.
```

This prompt replaces lines 106-169 of `apps/web/src/lib/pipeline.ts`'s `EXTRACTION_SYSTEM_PROMPT` only in the theme block. The full extraction prompt also covers tasks/goals/insights/lifeAreas — those stay as-is in V5; only the `themes` schema and the "Keep theme labels short (1-3 words)" guideline change.

---

## 4. What V5 still doesn't do

These are deliberate limitations — Phase 3 territory.

- **Cross-entry awareness.** V5 sees each entry in isolation. It can't tell that "defending the window", "defending calendar from depletion", and "defending time with family" should collapse into one graph node. That's the canonicalization layer Phase 3 needs (embedding similarity on first ingest, plus a weekly Pass 2 that promotes co-occurring entities into named patterns — see Phase 1 doc §4.2).
- **Entity extraction.** V5 emits zero entities. Things like "Celtics", "Boston", "Briarwood", "Mike", "anniversary" are valuable for search/filter and entry context — they're being thrown away. Phase 3 adds an `entities` array alongside `themes` (Option A from Phase 1 §4.2).
- **Empty-array entries.** Two entries returned `[]` under V5. The karate one-liner is correct (no pattern in 8 words). The "Boston / nice weather / drinks with friends" one is arguable — V3 produced "seeking social reconnection" which feels right. V5's stricter recurrence test rejected it. Acceptable trade-off, but a sliding edge.
- **Sparse-user cold start.** First few entries from a new user will likely return single themes or empty arrays under V5 — patterns can't emerge from one data point. The Theme Map's existing 10-entry unlock threshold absorbs this; nothing breaks.

---

## 5. Recommendation

**Ship V5 as the new theme block in `pipeline.ts`** (Phase 3 work). Specifically:

1. Replace the `themes` schema description and the "Keep theme labels short (1-3 words)" guideline in `EXTRACTION_SYSTEM_PROMPT` (lines 115-117 and 165 of `apps/web/src/lib/pipeline.ts`) with the V5 prompt body above.
2. Ship behind a feature flag `v1_1_dispositional_themes` so we can A/B against legacy extraction on a subset of users for ~1 week before rollout.
3. **Don't backfill.** Existing event-level Theme rows continue to age out; new entries flow through V5; the Theme Map's mention-count weighting will down-rank stale event-themes and up-rank new dispositional ones organically over a few weeks. (Backfill is reversible/cheap if we change our mind — but the cost of leaving old themes is low because most are already singletons.)
4. **Don't change the schema yet.** V5 fits the existing `Theme.name` + `ThemeMention` shape. The two-tier (Pattern vs Entity) schema split is Phase 3 — only needed when we add `entities`.

**Phase 3 (separate doc, awaiting your sign-off on V5 first):**
- Add `entities` array to the extraction schema + parser
- Add `Theme.tier` discriminant (or a separate `Entity` model — design call)
- Add embedding-based canonicalization for the "defending K"-style families
- Optional weekly Pass 2 that promotes recurring co-occurring entities into named patterns

**Stop conditions for Phase 2:** none expected. The V5 prompt is self-contained, doesn't change the schema, fits the existing `themes: { label, sentiment }[]` parser in `apps/web/src/lib/themes.ts:140-169` exactly. Rollback is one commit if needed.

---

## Appendix — bench artifacts

- Harness: `apps/web/scripts/theme-prompt-bench.ts` (V0/V3/V4/V5 in-source; V1/V2 in git history of this file at iter 1)
- Iteration outputs: `/tmp/theme-bench-iter{1,2,3}.json` (raw), `/tmp/bench-iter{1,2,3}-summary.txt` (pivoted)
- Same 20 entries as Phase 1's audit, transcripts pulled at run time
- Total spend: 60 Anthropic API calls (20 entries × 3 prompts in iter 3, 80 calls across iter 1, 60 calls across iter 2). Well under any rate-limit concern.
- Key handling: `process.env.ANTHROPIC_API_KEY` loaded via `dotenv` from `.env.local`. Key never appeared on a command line, in argv, or in any tool output. Per the post-rotation discipline (`feedback_secret_handling.md`).
