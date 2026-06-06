import type { ComponentType } from "react";

import { Step1Welcome } from "./step-1-welcome";
import { Step2ValueProp } from "./step-2-value-prop";
import { Step3Demographics } from "./step-3-demographics";
import { Step3MicrophonePermission } from "./step-3-microphone-permission";
import { Step4PracticeRecording } from "./step-4-practice-recording";
import { Step5MoodBaseline } from "./step-5-mood-baseline";
import { Step6WeeklyReportPriming } from "./step-6-weekly-report-priming";
import { Step7TrialExplanation } from "./step-7-trial-explanation";
import { Step8FirstEntryCta } from "./step-8-first-entry-cta";
import { Step9Notifications } from "./step-9-notifications";
import { StepAiConsent } from "./step-ai-consent";

export type OnboardingStepNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11;

/**
 * The Art. 9 special-category consent step's number. The onboarding
 * shell hides "Skip for now" on this step so it's a HARD gate — no path
 * to the recorder without an explicit grant. Keep in sync with the
 * ONBOARDING_STEPS array below.
 */
export const AI_CONSENT_STEP = 4;

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
 *
 * Component file names keep their original "step-N-" prefixes from
 * before the 2026-04-20 reordering. The number in the filename is a
 * historical convention, not an authoritative link to the current
 * step number — the registry below is the source of truth. Filename
 * renames would ripple through git history and imports for zero
 * runtime benefit.
 *
 * Slice 4 (2026-05-22): step 7 was "What matters most" (life-area
 * priorities multi-select). Per the parity-audit verdict + audit of
 * downstream consumers, that field was write-only metadata — nothing
 * read it. Step replaced in-place with weekly-report priming so the
 * step count stays 10 and any in-flight users (currentStep = 7)
 * resume at the same slot instead of an off-by-one error.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  { step: 1, title: "Welcome", Component: Step1Welcome },
  { step: 2, title: "What Acuity does", Component: Step2ValueProp },
  { step: 3, title: "A few quick things", Component: Step3Demographics },
  // Art. 9 consent — hard gate, immediately before the mic/recording
  // steps so no special-category audio is processed without consent.
  { step: 4, title: "AI processing consent", Component: StepAiConsent },
  { step: 5, title: "Microphone access", Component: Step3MicrophonePermission },
  { step: 6, title: "Practice round", Component: Step4PracticeRecording },
  { step: 7, title: "Mood baseline", Component: Step5MoodBaseline },
  { step: 8, title: "Your Sunday report", Component: Step6WeeklyReportPriming },
  { step: 9, title: "How the trial works", Component: Step7TrialExplanation },
  { step: 10, title: "Reminders", Component: Step9Notifications },
  { step: 11, title: "Ready when you are", Component: Step8FirstEntryCta },
];
