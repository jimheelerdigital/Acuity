import type { ComponentType } from "react";

import { Step10Ready } from "./step-10-ready";
import { Step1Welcome } from "./step-1-welcome";
import { Step2ValueProp } from "./step-2-value-prop";
import {
  Step3AboutYou,
  Step3Context,
} from "./step-3-demographics";
import { Step4Microphone } from "./step-4-microphone";
import { Step5AiConsent } from "./step-5-ai-consent";
import { Step5Practice } from "./step-5-practice";
import { Step6MoodSlider } from "./step-6-mood-slider";
import { Step8Trial } from "./step-8-trial";
import { Step9Reminders } from "./step-9-reminders";
// Step9LifeMatrixBaselines is NOT imported here in v1.1 — see history
// note below. The component file stays in-tree for future reuse as an
// in-app "Tune your Life Matrix" feature.

export { OnboardingShell } from "./shell";
export { useOnboarding } from "./context";

export interface OnboardingStep {
  step: number;
  title: string;
  Component: ComponentType;
}

/**
 * Single source of truth for the mobile onboarding flow. Order +
 * title mirror apps/web/src/app/onboarding/steps/steps-registry.ts
 * so a user who starts on web and finishes on mobile (or vice versa)
 * sees the same sequence.
 *
 * History:
 *   - 2026-05-14: AI consent step inserted at position 5 (build-40
 *     rejection under Apple Guideline 5.1.1(i) / 5.1.2(i)). Practice
 *     and downstream steps shifted down by 1.
 *   - 2026-05-15: Slice G2 density restructure — old Step 3
 *     "A few quick things" (5 sections, 401 LOC, heaviest by 4x)
 *     split into two screens: Step 3 "About you" (age/gender/country)
 *     and Step 4 "What brings you here" (reasons/life stage).
 *     Downstream steps shift +1: microphone now position 5, AI
 *     consent 6, etc. Total: 11 → 12 steps. File `step-5-practice.tsx`
 *     and `step-9-reminders.tsx` keep their git-history filenames
 *     even though their positions shifted.
 *   - 2026-05-21 (Phase C): step 9 "What matters most" (top-3 ranking
 *     picker, `Step7LifeAreas`) replaced by step 9 "Life Matrix
 *     baseline" (per-axis 0-100 carousel, `Step9LifeMatrixBaselines`).
 *     New step takes over the shell chrome via
 *     setHideShellChrome(true) and ships its own Continue/Back inside
 *     a 10-axis carousel. Payload shape changes from
 *     {lifeAreaPriorities:{...}} to {lifeAreaBaselines:{...}} —
 *     server `/api/onboarding/update` accepts both during the
 *     build-42 transition window.
 *   - 2026-05-21 (v1.1 ship): Life Matrix baseline carousel removed
 *     from the onboarding sequence — 10 sequential slider decisions
 *     before the user records a single entry creates too much
 *     friction. Total: 12 → 11 steps. New ordering: welcome →
 *     value prop → about you → what brings you here → mic →
 *     AI consent → practice → mood slider → trial → reminders →
 *     ready. Server defaults all 10 LifeMapArea rows to score100=50
 *     (neutral, schema default) for any user who hasn't set
 *     baselines; AI extraction populates them from transcripts.
 *     The Step9LifeMatrixBaselines component file is kept in-tree
 *     (dormant) — planned reuse as an in-app "Tune your Life
 *     Matrix" feature accessible from the Insights tab.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  { step: 1, title: "Welcome", Component: Step1Welcome },
  { step: 2, title: "What Acuity does", Component: Step2ValueProp },
  { step: 3, title: "About you", Component: Step3AboutYou },
  { step: 4, title: "What brings you here", Component: Step3Context },
  { step: 5, title: "Microphone access", Component: Step4Microphone },
  { step: 6, title: "How Acuity uses AI", Component: Step5AiConsent },
  { step: 7, title: "Practice round", Component: Step5Practice },
  { step: 8, title: "Mood baseline", Component: Step6MoodSlider },
  { step: 9, title: "How the trial works", Component: Step8Trial },
  { step: 10, title: "Reminders", Component: Step9Reminders },
  { step: 11, title: "Ready when you are", Component: Step10Ready },
];
