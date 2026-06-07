# Web Onboarding Alignment Audit — iOS 5-step (92a74d7) ↔ Web /onboarding

**Status:** READ-ONLY audit. No code changed. Hold for Jim's QA before implementation.
**Date:** 2026-06-05
**Scope:** post-signup onboarding only (`apps/web/src/app/onboarding/`). NOT the `/start` acquisition funnel.

## Churn check (gating)
Keenan's last-24h commits (`2ecb500`, `175629f`, `ca69834`, `8cfc55e`) are all on the **`/start` funnel** (`onboarding-funnel.tsx`, download screen, step persistence) — **not** the post-signup `/onboarding/steps/*`, which is untouched and safe to audit. ⚠️ One adjacency: `2ecb500` ("Continue in Web App skips onboarding") calls `/api/onboarding/complete` from the funnel's download screen — so the *completion* contract is shared. Coordinate timing with Keenan before implementation.

## The delta (iOS 5 → Web 10)

| iOS step | Web step | Status | Notes |
|---|---|---|---|
| 1 · AI/Art.9 consent | — | **MISSING on web onboarding** | iOS captures Art.9 at onboarding; web captures it only at `/upgrade` checkout (see Flag 1). |
| 2 · Microphone | 4 · Microphone (`step-3-microphone-permission`) | ✅ Equivalent | iOS non-skippable; web skippable. |
| 3 · Practice recording | 5 · Practice (`step-4-practice-recording`) | ✅ Equivalent | Both 10s throwaway, no DB write. |
| 4 · Reminders | 9 · Reminders (`step-9-notifications`) | ⚠️ Diverges | iOS: single toggle, fixed 9am+8pm, **captures `User.timezone`**. Web: time + frequency pickers, **no timezone capture**. |
| 5 · Ready/Finish | 10 · First-entry CTA (`step-8-first-entry-cta`) | ✅ Equivalent | Both terminal; both POST `/api/onboarding/complete`. |
| — | 1 · Welcome | Web-only | Read-only intro; fires `onboarding_started`. |
| — | 2 · Value prop | Web-only | Three-beat loop explainer. |
| — | 3 · Demographics | Web-only | Writes `UserDemographics` (age/gender/country/reasons/lifeStage). **Data-loss risk if cut.** |
| — | 6 · Mood baseline | Web-only | Writes `UserOnboarding.moodBaselineNumeric` + `moodBaseline`. Seeds Life Matrix. **Data-loss risk if cut.** |
| — | 7 · Weekly-report priming | Web-only | Sample weekly-report mock. **This is the hero conversion driver per the sales-copy rubric** — cutting it is a conversion risk, not just a parity change. |
| — | 8 · Trial explanation | Web-only | 14-day + Day-14 Life Audit expectation. |

**Shared endpoints:** `/api/onboarding/update` (routes fields to `User` / `UserOnboarding` / `UserDemographics`), `/api/onboarding/complete`.

## Three decisions for QA (these gate implementation)

### Flag 1 — Art. 9 consent: web trial users have a gap (compliance)
- iOS: explicit Art.9 checkbox at **onboarding step 1** → `/api/consent/record` (`special_category_processing`).
- Web: Art.9 captured only at **`/upgrade` checkout** (`upgrade-plan-picker.tsx:85`). A web **trial** user records entries (special-category data) *before* subscribing — so they process that data **without prior explicit consent**.
- **Recommendation:** add the Art.9 consent step to web onboarding (position 1, before mic), reusing the existing `/api/consent/record` + `CONSENT_WORDING`/`art9-v1` in `apps/web/src/lib/consent.ts`. This is the one change I'd treat as **required**, not optional.

### Flag 2 — Literal parity vs. selective alignment (product/strategy)
"Match iOS 5-step" taken literally = cut Welcome, Value-prop, Demographics, Mood-baseline, Weekly-report-priming, Trial-explanation. But:
- **Weekly-report priming** is the rubric's hero conversion artifact — cutting it on web (where conversion happens) likely hurts trial→paid.
- **Demographics + mood baseline** are real data captures (attribution + Life Matrix seed) that iOS doesn't collect. Cutting them = silent data loss for existing web-driven features.
- Web and iOS have different jobs: iOS is post-download (already converted-ish); web onboarding sits in the conversion path.
- **Decision needed:** do you want *literal* 5-step parity, or *core-flow* parity (same consent → mic → practice → reminders → finish spine) while **keeping** the web-only conversion/data steps? My recommendation: core-flow parity + keep weekly-report-priming and (optionally) demographics/mood.

### Flag 3 — Reminders divergence (functional)
- iOS captures `User.timezone` (IANA) and uses fixed 9am+8pm via Inngest cron. Web captures `notificationTime` + `notificationDays` but **not timezone**, and the web dispatcher is noted as "planned v1.4."
- If web adopts iOS's model, **timezone must be captured** or web reminders fire at the wrong UTC time. If web keeps its richer picker, that's fine — but it's a deliberate divergence to confirm.

## Meta-Pixel / funnel events (so we don't break Keenan's tracking)
- Web onboarding steps fire `onboarding_started` / `onboarding_step_completed` / `onboarding_skipped` / `onboarding_completed` via `trackClient` (in `onboarding-shell.tsx` + `step-8`). These are **step-structure-coupled** (step indices in payloads).
- **`fbq` / `CompleteRegistration` are NOT in the onboarding steps** — they fire in the pre-auth `/start` funnel. So cutting onboarding steps does **not** drop Pixel/CompleteRegistration events. ✅
- **Action:** confirm with Keenan that nothing downstream keys off specific onboarding step *indices* before renumbering.

## Recommendation summary (for QA sign-off)
1. **Add Art.9 consent to web onboarding** (required — closes the trial-period gap).
2. **Core-flow parity, not literal**: align the spine (consent → mic → practice → reminders → finish); **keep** weekly-report priming; decide per-item on demographics/mood/value-prop/trial-explanation.
3. **Capture timezone** if web moves to the iOS reminder model.
4. Coordinate the renumber with Keenan (event indices + the shared `/complete` contract he just touched).
