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
import { Step7LifeAreas } from "./step-7-life-areas";
import { Step8Trial } from "./step-8-trial";
import { Step9Reminders } from "./step-9-reminders";

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
  { step: 9, title: "What matters most", Component: Step7LifeAreas },
  { step: 10, title: "How the trial works", Component: Step8Trial },
  { step: 11, title: "Reminders", Component: Step9Reminders },
  { step: 12, title: "Ready when you are", Component: Step10Ready },
];
