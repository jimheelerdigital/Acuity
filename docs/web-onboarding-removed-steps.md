# Web onboarding — removed steps (reversion record)

**Date:** 2026-06-06
**Decision:** Jim + Keenan — cut web onboarding from 11 → 5 steps for **literal iOS 5-step parity**. Reason: **funnel drop-off**. The longer web flow (welcome, value-prop, demographics, mood, weekly-report priming, trial explanation) was costing completions; aligning to the iOS 5-step spine reduces friction.

**What's kept (the 5, mirroring iOS):** AI Consent (Art. 9) → Mic permission → Practice recording → Reminders → Ready.

**Important:** the removed component files are **retained in the repo** (`apps/web/src/app/onboarding/steps/`). They are only **unwired from `steps-registry.ts`** (removed from `ONBOARDING_STEPS` + imports). To restore a step: re-add its import + an entry to the array, renumber, and update `DEFAULT_SKIPPABLE` / `AI_CONSENT_STEP` as needed.

---

## Removed steps

### 1. Welcome
- **Component:** `Step1Welcome` — `apps/web/src/app/onboarding/steps/step-1-welcome.tsx`
- **Copy:** Headline "You're in." + intro framing the (former) 7-question flow.
- **Data captured:** none (read-only display).
- **API:** none. (The shell fires `onboarding_started` on the first step regardless of which step that is — still fires; see Meta-Pixel note below.)
- **Why removed:** drop-off — pure preamble, no data, easy cut.

### 2. Value proposition ("Here's the loop")
- **Component:** `Step2ValueProp` — `step-2-value-prop.tsx`
- **Copy:** Headline "Here's the loop." + three-beat (talk → extract → insights) + crisis footer.
- **Data captured:** none.
- **API:** none.
- **Why removed:** drop-off — educational, not required to start.

### 3. Demographics
- **Component:** `Step3Demographics` — `step-3-demographics.tsx`
- **Copy:** "A few quick things" + optional fields.
- **Data captured:** ⚠️ **`UserDemographics`** upsert — `ageRange`, `gender`, `country`, `primaryReasons[]`, `primaryReasonsCustom`, `lifeStages[]`, `lifeStageCustom`.
- **API:** `POST /api/onboarding/update` (step payload routed to `UserDemographics` upsert).
- **Why removed:** drop-off. **Data-loss note:** web no longer captures demographics at onboarding. iOS never did, so this is parity; but any web attribution/segmentation keyed on `UserDemographics` will stop getting new onboarding-sourced rows. Restore this step (or move the capture elsewhere) if that data is needed.

### 4. Mood baseline
- **Component:** `Step5MoodBaseline` — `step-5-mood-baseline.tsx`
- **Copy:** "How's your baseline lately?" + 1–10 slider.
- **Data captured:** ⚠️ **`UserOnboarding.moodBaselineNumeric`** (1–10) + **`moodBaseline`** (enum GREAT|GOOD|NEUTRAL|LOW|ROUGH).
- **API:** `POST /api/onboarding/update`.
- **Why removed:** drop-off. **Data-loss note:** no mood baseline seed for the Life Matrix on web. iOS removed this in v1.3 too, so it's parity. Restore if Life Matrix day-1 quality regresses.

### 5. Weekly-report priming ("Your Sunday report")
- **Component:** `Step6WeeklyReportPriming` — `step-6-weekly-report-priming.tsx`
- **Copy:** "A report like this lands in your inbox." + sample weekly-report mock-up card.
- **Data captured:** none.
- **API:** none.
- **Why removed:** drop-off. **Conversion note:** this was the rubric's hero conversion artifact (shows the weekly report — the primary value driver). Cut per the Jim+Keenan drop-off decision; flagging that it's the one removal with a conversion (not just funnel-length) tradeoff. Easiest high-value step to restore if trial→paid dips.

### 6. Trial explanation ("How the trial works")
- **Component:** `Step7TrialExplanation` — `step-7-trial-explanation.tsx`
- **Copy:** "How the trial works." + Today / Day 14 (Life Audit) / After timeline.
- **Data captured:** none.
- **API:** none.
- **Why removed:** drop-off — trial mechanics are also surfaced post-onboarding (home trial banner, /account).

---

## New 5-step flow (post-cut)
| # | Step | Component | Skippable? |
|---|------|-----------|-----------|
| 1 | AI Consent (Art. 9) | `StepAiConsent` | **No — hard gate** (Continue gated + "Skip for now" hidden) |
| 2 | Mic permission | `Step3MicrophonePermission` | No (mirrors iOS — Continue enables on permission result) |
| 3 | Practice recording | `Step4PracticeRecording` | Yes |
| 4 | Reminders | `Step9Notifications` | Yes ("Not now" is fine) |
| 5 | Ready | `Step8FirstEntryCta` | n/a (terminal, owns its CTA) |

`DEFAULT_SKIPPABLE = [3, 4]`. `AI_CONSENT_STEP = 1`. `clampStep` derives max from `ONBOARDING_STEPS.length` (auto-handles 5).

**Meta-Pixel:** confirmed safe — `fbq`/`CompleteRegistration` live in the `/start` acquisition funnel, NOT these post-signup steps. Onboarding fires only `trackClient` (PostHog) events (`onboarding_started`/`_step_completed`/`_skipped`/`_completed`); renumbering changes their `step` payload values but no Pixel event. (`step-8-first-entry-cta` hardcoded `finalStep: 8` → updated to 5.)
