import type { ComponentType } from "react";

import { Step1Welcome } from "./step-1-welcome";
import { Step2ValueProp } from "./step-2-value-prop";
import { Step3Referral } from "./step-3-referral";
import { Step4MicrophonePermission } from "./step-4-microphone-permission";
import { Step5MoodBaseline } from "./step-5-mood-baseline";
import { Step6LifeAreaPriorities } from "./step-6-life-area-priorities";
import { Step7ExpectedCadence } from "./step-7-expected-cadence";
import { Step8TrialExplanation } from "./step-8-trial-explanation";

export type OnboardingStepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface OnboardingStep {
  step: OnboardingStepNumber;
  title: string;
  Component: ComponentType;
}

/**
 * Single source of truth for the onboarding flow order. Changing the
 * order requires updating the UserOnboarding.currentStep values in
 * existing rows — not a concern today since no users have gone
 * through it yet.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  { step: 1, title: "Welcome", Component: Step1Welcome },
  { step: 2, title: "What Acuity does", Component: Step2ValueProp },
  { step: 3, title: "How did you find us", Component: Step3Referral },
  { step: 4, title: "Microphone permission", Component: Step4MicrophonePermission },
  { step: 5, title: "Mood baseline", Component: Step5MoodBaseline },
  { step: 6, title: "Life area priorities", Component: Step6LifeAreaPriorities },
  { step: 7, title: "Expected cadence", Component: Step7ExpectedCadence },
  { step: 8, title: "Ready to record", Component: Step8TrialExplanation },
];
