import type { ComponentType } from "react";

import { Step1Welcome } from "./step-1-welcome";
import { Step2ValueProp } from "./step-2-value-prop";
import { Step3MicrophonePermission } from "./step-3-microphone-permission";
import { Step4PracticeRecording } from "./step-4-practice-recording";
import { Step5MoodBaseline } from "./step-5-mood-baseline";
import { Step6LifeAreaPriorities } from "./step-6-life-area-priorities";
import { Step7TrialExplanation } from "./step-7-trial-explanation";
import { Step8FirstEntryCta } from "./step-8-first-entry-cta";

export type OnboardingStepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface OnboardingStep {
  step: OnboardingStepNumber;
  title: string;
  Component: ComponentType;
}

/**
 * Single source of truth for the onboarding flow order. Changing the
 * order (or renumbering) requires a one-line migration for existing
 * UserOnboarding.currentStep values if any users are mid-flow, but
 * that's rare — the dashboard redirect reads completedAt (null vs
 * not-null), not the specific step value.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  { step: 1, title: "Welcome", Component: Step1Welcome },
  { step: 2, title: "What Acuity does", Component: Step2ValueProp },
  { step: 3, title: "Microphone access", Component: Step3MicrophonePermission },
  { step: 4, title: "Practice round", Component: Step4PracticeRecording },
  { step: 5, title: "Mood baseline", Component: Step5MoodBaseline },
  { step: 6, title: "What matters most", Component: Step6LifeAreaPriorities },
  { step: 7, title: "How the trial works", Component: Step7TrialExplanation },
  { step: 8, title: "Ready when you are", Component: Step8FirstEntryCta },
];
