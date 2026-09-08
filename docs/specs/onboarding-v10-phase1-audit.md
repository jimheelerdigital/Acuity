# Onboarding v10 — Phase 1: audit of what exists today

**Date:** 2026-08-19
**Branch:** `feat/onboarding-v10`
**Status:** audit only. No code changed. `ONBOARDING_V10` does not exist yet.

> ⚠️ **The "Ripple Onboarding v10 Layout Spec" is not in this repo.** Searched by filename (`*v10*`, `*onboarding*spec*`, `*layout*spec*`) and by content (`onboarding v10`, `v10 layout`, `onboarding-v10`) across all `.md`/`.txt`, plus untracked files. No match. Screens 1–9 below are reconstructed from the brief in the task prompt, not from the spec. **Per-screen layout, copy, and the exact `v10_*` event names still need the doc.**

---

## 1. Headline finding

**A flow with nearly the v10 shape already exists** — `apps/mobile/app/onboarding-new/*`, built as "onboarding-v2, slices 2–9". It already has pain → record → processing → reveal → paywall → account, plus a reveal screen at 711 lines.

So v10 is **not greenfield**. It is (a) a large collapse of the front half, (b) a **swap of paywall/account order**, (c) one genuinely new screen, and (d) a data-honesty pass on the reveal.

Second finding: **`onboarding-new` is not the default cold-launch path.** `apps/mobile/lib/feature-flags.ts` records that `isNewOnboardingEnabled` was **deleted** in v1.3 (2026-06-03) and cold launch now routes to `/(auth)/sign-in` unconditionally. The funnel "remains reachable via Meta-ad deep links but is no longer the default cold-launch destination." That file is now an empty stub (`export {}`) — deliberately kept so "adding the next flag in here is the right pattern."

That stub is where `ONBOARDING_V10` belongs.

---

## 2. Two separate onboarding systems

| | Web `/onboarding/*` | Mobile `/onboarding-new/*` |
|---|---|---|
| When | **Post**-signup | **Pre**-auth |
| Entry | after account creation | Meta-ad deep links only |
| Shape | 9 numbered `steps/step-N-*.tsx` | 16-screen emotional arc |
| Recording | `step-4-practice-recording.tsx` (311 ln) | `record.tsx` (569 ln) |
| Account | already exists | `account.tsx` (673 ln) |
| Paywall | none in-flow | `paywall.tsx` (603 ln) |

There is also `apps/web/src/components/onboarding-funnel.tsx` — **2709 lines**, the web marketing funnel, separate again and the largest single file in the area.

**v10 as briefed is the mobile pre-auth flow.** Whether web needs the same treatment is an open question (see §7) — the parity-by-default rule says probably yes, but the brief describes a fresh-install mobile flow.

---

## 3. Current mobile order (traced from `router.push`/`replace`)

```
pain → q1 → q2 → q3 → q4 → q5 → bridge → promise → how-it-works
     → commitment → disclosure → record → processing → reveal
     → account → paywall → (tabs)
```

**16 screens. Five diagnostic questions (q1–q5) before anything happens.**

Supporting: `_layout.tsx` wraps everything in `OnboardingProvider` so q1–q5 answers survive back-navigation (reset only on leaving the folder). `_components/commitment-ring.tsx` (207 ln).

`reveal.tsx` branches two ways: back to `record` (record another) or on to `account`.

---

## 4. v10 vs today — the actual deltas

| v10 screen | Today | Delta |
|---|---|---|
| 1 Recognition | `pain.tsx` (232 ln) | reuse/reshape |
| 2 Mirror + Start | `promise` + `bridge` + `how-it-works` + `commitment` + `disclosure` | **collapse 5 → 1** |
| — | `q1`–`q5` | **remove from the pre-record path** (11 screens become 2) |
| 3 Recording | `record.tsx` (569 ln) | reuse; verify it's ≤2 taps from launch |
| 4 Processing | `processing.tsx` (429 ln) | reuse |
| 5 Reveal | `reveal.tsx` (711 ln) | **major**: tasks Add/Edit/Dismiss, "what seems to matter", ONE hedged observation, compounding strip |
| 6 Paywall | `paywall.tsx` (603 ln) | **reorder** + new pricing |
| 7 Save/account | `account.tsx` (673 ln) | **reorder** + RC anonymous-id claim |
| 8 Check-in | **does not exist** | **new** |
| 9 Home | `(tabs)/index.tsx` (882 ln) | reuse |

### The load-bearing reorder
Today: `reveal → account → paywall`. v10: `reveal → paywall → account`.

`account.tsx` currently pushes to `paywall.tsx`, and `paywall.tsx` exits to `(tabs)`. Inverting means the paywall must work **with no authenticated user** — which is exactly what the RC anonymous-`app_user_id` → `Purchases.logIn(User.id)` aliasing enables. That aliasing is already wired (`apps/mobile/contexts/auth-context.tsx`, 3 call sites) and is the reason this is now buildable.

### Two product taps to recording
Today the fastest path to `record` is **11 screens**. v10 wants 2. This is the single biggest structural change and where the north-star metric (first debrief completed per install) is won or lost.

---

## 5. Vocabulary — current state

The brief mandates **"debrief"**, never journal / brain dump / check-in for the core action.

- `debrief` appears in exactly **2 files** (`bridge.tsx`, `account.tsx`), once each.
- `journaling` appears **2×** in `onboarding-new`.
- Wider repo copy still says "journaling" extensively (`voice-journaling` page, FAQ, app-store listing).

⚠️ Note the tension: **"check-in" is banned for the core action, but v10 screen 8 is named "Check-in."** Presumably that screen is about notification cadence rather than the debrief action — but the naming needs confirming from the spec so the copy doesn't violate the rule it sits next to.

---

## 6. Data-honesty — what the reveal claims today

Good news: **`reveal.tsx` makes no threshold or unlock claims at all.** Grep for `weekly|life matrix|unlock|day 7|pattern` found only one unrelated comment. So there is no existing false promise to walk back — the compounding strip is additive, and the three rules can be enforced from the start:

| Surface | Truth (verified against prod) | Rule for the strip |
|---|---|---|
| Patterns (`UserInsight`) | fast, ~2 entries median | fine to promise early |
| Life Matrix | **exists at 0 entries** (seeded from dimension preset) | **never** "locked until N entries"; value is sharpening, not appearance |
| Weekly report | real threshold, ~9+ entries (median 37) | set that expectation; don't imply Day 7 for a light user |

The evidence rule to reuse is already on this branch: `packages/shared/src/evidence.ts` → `classifyInsightConfidence()`, which gates any insight with zero traceable source entries out of "pattern" status regardless of model confidence. Screen 5's "ONE hedged observation" must go through it. `lib/evidence/excerpt.ts` supplies verbatim citations without the model ever seeing a transcript — the summary-citation approach the brief requires preserving.

---

## 7. Open questions (need Jim / Keenan)

1. **The spec itself.** Blocking for per-screen layout, copy, and exact `v10_*` event names.
2. **Screen 8 "Check-in"** — what is it, and how is it named without breaking the check-in vocabulary ban?
3. **Web parity.** v10 as briefed is mobile-only. Parity-by-default says build both; the brief says fresh-install. Which?
4. **q1–q5 fate.** Deleted, or moved after the reveal? They feed `OnboardingProvider`; something may consume those answers downstream.
5. **Strike-through/anchor (Option A vs B)** — Keenan's. Config toggle, not hardcoded (already the plan).
6. **`onboarding-new` deep links.** Meta ads point at these routes. If v10 replaces them, the ad links need to keep working or be repointed.

---

## 8. Branch state

Branched from `feat/evidence-receipts`, then **merged `feat/revenuecat-migration`** (8 commits it was missing, incl. the RC public-key auth fix and the schema guardrail). Clean merge, 0 conflicts.

Base verified: **659/659 tests green**, typecheck **137** (below both parent baselines — the merged `CarouselPost` reconciliation fixed 4 carousel errors). RC aliasing present, evidence rule present, `app.json` at 1.3.7.

Merge order for later: `revenuecat` → `evidence-receipts` → `onboarding-v10`.

Also removed a stray root `app.json` I had accidentally committed in `b0b1fe54` (an `eas build` run from the repo root scaffolded it). **Still present on `feat/revenuecat-migration`** — remove there too or it returns via the next merge.
