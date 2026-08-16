# Evidence-backed insights — implementation notes

**Branch:** `feat/evidence-receipts`
**Status:** built, nothing live. `EVIDENCE_RECEIPTS` is OFF in every environment.
**Companion:** [`INSIGHT_GENERATION_AUDIT.md`](./INSIGHT_GENERATION_AUDIT.md) — how generation works today and where traceability was lost.

---

## 1. The rule

> An insight with no traceable source entries is low-confidence and must NEVER be surfaced as a confirmed pattern.

Implemented in `packages/shared/src/evidence.ts` as `classifyInsightConfidence`, applied at the read layer in `lib/evidence/memory-ledger.ts`.

It is a **gate, not a weight**. A weighting scheme lets a sufficiently confident fabrication through; a gate cannot. It is not overridable by:

- model confidence (swept 0→1 in tests, always refused),
- the user marking the insight ACCURATE — because the promise is *evidential*, not merely truthful. If we can't produce the quote, we can't show the receipt, whatever the user says.

Tiers: `REFUTED` (user said wrong) → `UNSOURCED` (no evidence) → `PROVISIONAL` (1 source, or low confidence) → `CONFIRMED` (≥2 sources at ≥0.7). Only `CONFIRMED` sets `surfaceAsPattern`.

## 2. How receipts are obtained without sending transcripts to the model

Today's digest deliberately excludes transcripts — *"No transcripts (privacy + token cost)"* (`compute-user-insights.ts:397`). Getting quotes by shipping transcripts to Claude would reverse that standing decision as a side effect of a feature, which isn't this change's call to make.

Instead:

1. Each digest line is labelled `[E1]`, `[E2]`… (`buildDigestWithSources`). The model sees the **same summaries as before** — only a label is added.
2. The model cites which labels support each observation, and self-reports confidence.
3. The server resolves those labels to entry ids and picks the actual supporting sentence locally (`lib/evidence/excerpt.ts`).

This makes excerpts **verbatim by construction**. A model asked to quote will sometimes paraphrase or produce a fluent quote that isn't in the source — the exact failure mode this track exists to prevent.

Two guards in `resolveEvidence`:
- a ref we never issued (model invented `E99`) is dropped;
- a real-but-irrelevant entry is dropped, because `selectExcerpt` returns null when no content words overlap.

So `evidenceCount` reflects entries we can genuinely quote — which is what the rule then gates on.

### The stemmer is load-bearing
The model writes "run", the user said "running". Without stemming, exact matching misses those pairs, `selectExcerpt` returns null, and a genuinely well-supported insight is suppressed as unsourced. Under-matching silently destroys real receipts. It's deliberately conservative (no irregular forms) — a wrong stem creates a false match, which is the worse error.

## 3. What's flag-gated

| Path | With `EVIDENCE_RECEIPTS` off |
|---|---|
| `compute-user-insights` cron | Byte-identical to before: original prompt, no sources, same `createMany` |
| `POST /api/insights/:id/correction` | 404 |
| `GET /api/memory-ledger` | 404 |
| Schema columns / `InsightEvidence` | Present but unwritten; legacy rows read as UNSOURCED, which is correct |

Unsourced observations are **written and logged, not rejected at generation**. Suppression happens at read time, so observer mode can measure how often the generator over-reaches (`summary.unassertedShare`, and the `unsourced observation` log line).

---

## 4. ⚠️ LIVE BEHAVIOR CHANGE — needs a go/no-go

The `tierMatches` fix (hygiene task 7) is **not** behind `EVIDENCE_RECEIPTS` and changes production behavior on merge.

**What changed:** `requiredTier: "PRO"` flags now accept active-TRIAL users, because `tierMatches` reads the entitlement resolver (`canExtractEntries`) instead of comparing `subscriptionStatus === "PRO"` directly.

**Why:** it was a second, independent entitlement authority that disagreed with the first. `entitlementsFor` grants trials the full paid feature set, so a paywall-gated feature worked on trial while the identical flag-gated feature did not.

**Measured blast radius** (read-only query against prod, 2026-08-16):

- Flags with `requiredTier` set: **exactly one** — `state_of_me_report` (tier=PRO, enabled, 100% rollout).
- Users currently on TRIAL: **5**.
- `/api/state-of-me` gates **only** on `gateFeatureFlag` — there is no second `requireEntitlement` check behind it.

**Therefore: on merge, 5 trial users gain the ability to generate the State of Me report.**

That is the intended fix (trials get consistent access), and it's consistent with how every other PRO feature already treats trials. But it is a real, user-visible change to a live app, so it wants an explicit yes rather than riding in on a hygiene commit.

**If the answer is no:** revert the `PRO` branch of `tierMatches` to `resolved.state.subscriptionStatus === "PRO"`. Everything else in this branch is unaffected — the resolver plumbing and tests stay valid either way.

**Deliberately NOT changed:** the `FREE` branch still reads raw status. "FREE tier" flags target non-paying users (upgrade nudges), and trials are a prime audience; re-deriving that branch from the entitlement would have flipped TRIAL out of it and PAST_DUE into it. No flag uses `requiredTier: "FREE"` today, so this is about not making an unrelated product decision by accident.

---

## 5. Blocked / needs a product decision

1. **Transcript excerpts vs summary excerpts.** `selectExcerpt` prefers the transcript and falls back to the summary. Summary-sourced excerpts have null offsets (they have no position in the transcript) and are model-written rather than the user's own words. Whether a receipt may quote a summary — or must always quote the user — is a product call.
2. **The heuristic detectors still can't cite.** Area-delta, theme-spike, streak and mood-drift signals are computed from real aggregates but don't retain the entry ids behind them, so heuristic-fallback insights land as UNSOURCED. Making them citable is a contained follow-up (the ids are right there in the queries — `compute-user-insights.ts:277-319`, `:343-387`), but it changes what those detectors return.
3. **`WeeklyReport` has no provenance.** `insightBullets` is a bare `String[]` with nothing to hang evidence on. Giving weekly reports receipts needs a schema decision (bullet → structured row) that this track didn't take.
4. **Confidence thresholds are a first guess.** `CONFIRMED_MIN_EVIDENCE = 2`, `CONFIRMED_MIN_CONFIDENCE = 0.7`. They should be tuned against real observer-mode output, not chosen a priori.
5. **No UI.** Data layer only, by instruction. The ledger payload shape encodes the product claim (`patterns` vs `uncertain` with reasons) and is the thing worth reviewing first.
6. **`prisma db push` still needed** for `InsightEvidence` + the four `UserInsight` columns. The diff is additive-only (verified: 0 destructive ops) — but see the `CarouselPost` hazard note in `REVENUECAT_MIGRATION.md`; that reconciliation landed on the RevenueCat branch, not this one.

---

## 6. Branch dependency

`feat/evidence-receipts` is branched from **`feat/revenuecat-migration`**, not `main`, because task 7 requires `lib/entitlements/resolve.ts`, which only exists there.

Merge order: **RevenueCat branch first**, then this one. Merging this alone would bring the RC commits with it.
