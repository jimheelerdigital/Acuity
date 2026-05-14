import type { ComponentType } from "react";

import { Step10Ready } from "./step-10-ready";
import { Step1Welcome } from "./step-1-welcome";
import { Step2ValueProp } from "./step-2-value-prop";
import { Step3Demographics } from "./step-3-demographics";
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
 * 2026-05-14: AI consent step inserted at position 5 (build-40
 * rejection under Apple Guideline 5.1.1(i) / 5.1.2(i) — explicit
 * in-app consent required before voice data goes to Anthropic +
 * OpenAI). Practice and downstream steps shifted down by 1; the
 * filename `step-5-practice.tsx` still ends in "-5" for git-history
 * reasons but the component now runs at position 6. Renaming would
 * be cosmetic and rotate the file's git history.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  { step: 1, title: "Welcome", Component: Step1Welcome },
  { step: 2, title: "What Acuity does", Component: Step2ValueProp },
  { step: 3, title: "A few quick things", Component: Step3Demographics },
  { step: 4, title: "Microphone access", Component: Step4Microphone },
  { step: 5, title: "How Acuity uses AI", Component: Step5AiConsent },
  { step: 6, title: "Practice round", Component: Step5Practice },
  { step: 7, title: "Mood baseline", Component: Step6MoodSlider },
  { step: 8, title: "What matters most", Component: Step7LifeAreas },
  { step: 9, title: "How the trial works", Component: Step8Trial },
  { step: 10, title: "Reminders", Component: Step9Reminders },
  { step: 11, title: "Ready when you are", Component: Step10Ready },
];
