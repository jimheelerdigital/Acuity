import type { ComponentType } from "react";

import { Step3MicrophonePermission } from "./step-3-microphone-permission";
import { Step4PracticeRecording } from "./step-4-practice-recording";
import { Step8FirstEntryCta } from "./step-8-first-entry-cta";
import { Step9Notifications } from "./step-9-notifications";
import { StepAiConsent } from "./step-ai-consent";

export type OnboardingStepNumber = 1 | 2 | 3 | 4 | 5;

/**
 * The Art. 9 special-category consent step's number. The onboarding
 * shell hides "Skip for now" on this step so it's a HARD gate — no path
 * to the recorder without an explicit grant. Keep in sync with the
 * ONBOARDING_STEPS array below.
 */
export const AI_CONSENT_STEP = 1;

export interface OnboardingStep {
  step: OnboardingStepNumber;
  title: string;
  Component: ComponentType;
}

/**
 * Single source of truth for the onboarding flow order. The dashboard
 * redirect reads completedAt (null vs not-null), not the specific step
 * value, so renumbering is safe for in-flight users.
 *
 * 2026-06-06: cut from 11 → 5 steps for literal iOS 5-step parity
 * (Jim + Keenan decision — funnel drop-off). Welcome, value-prop,
 * demographics, mood baseline, weekly-report priming, and trial
 * explanation were UNWIRED here (their component files are retained in
 * this directory). To restore one, re-add its import + an array entry
 * and renumber. Full reversion record:
 * docs/web-onboarding-removed-steps.md.
 *
 * Component file names keep their original "step-N-" prefixes — the
 * number in the filename is historical, not the current step number;
 * this array is authoritative.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  // 1 — Art. 9 consent FIRST (hard gate, before any audio is processed).
  { step: 1, title: "AI processing consent", Component: StepAiConsent },
  { step: 2, title: "Microphone access", Component: Step3MicrophonePermission },
  { step: 3, title: "Practice round", Component: Step4PracticeRecording },
  { step: 4, title: "Reminders", Component: Step9Notifications },
  { step: 5, title: "Ready when you are", Component: Step8FirstEntryCta },
];
