import type { ComponentType } from "react";

import { Step10Ready } from "./step-10-ready";
import { Step4Microphone } from "./step-4-microphone";
import { Step5AiConsent } from "./step-5-ai-consent";
import { Step5Practice } from "./step-5-practice";
import { Step9Reminders } from "./step-9-reminders";
// Welcome, ValueProp, demographics (AboutYou, Context), MoodSlider,
// Trial, and LifeMatrixBaselines are intentionally NOT imported here
// in v1.3. They are kept in-tree for potential reuse but excluded
// from the active onboarding sequence.

export { OnboardingShell } from "./shell";
export { useOnboarding } from "./context";

export interface OnboardingStep {
  step: number;
  title: string;
  Component: ComponentType;
}

/**
 * Single source of truth for the mobile onboarding flow.
 *
 * v1.3 (2026-06-03) rewrite — 5 in-shell steps after sign-in:
 *   1. AI processing disclosure (Apple 5.1.1(i)/5.1.2(i))
 *   2. Microphone access (Apple 5.1.1(iv): CTA "Continue", no Skip)
 *   3. Practice round (record + show extraction)
 *   4. Notifications (single Enable toggle — NO time picker, NO cadence)
 *   5. Ready
 *
 * Combined with /(auth)/sign-in (step 1 of the user-facing flow),
 * total is 6 steps as spec'd. Disclosure intentionally lands FIRST
 * in-shell so the user sees AI subprocessors named BEFORE any audio
 * leaves the device — pre-auth try-recording funnel handles this
 * separately via /onboarding-new/disclosure.
 *
 * History (compacted; full audit trail in git):
 *   - 2026-05-14: AI consent inserted (build-40 Apple rejection).
 *   - 2026-05-15: Density restructure (welcome / valueProp / demos).
 *   - 2026-05-21: Life Matrix baseline carousel removed (friction).
 *   - 2026-06-03 (v1.3): Removed welcome, value-prop, demographics,
 *     mood baseline, trial explainer. Moved AI consent from
 *     position 6 → position 1. Stripped time picker from reminders.
 *     Existing users with onboardingCompleted=true are unaffected;
 *     in-flight users with completedAt=null resume at step 1 of
 *     the new 5-step shell on next launch.
 *
 * Existing-user safety: server `/api/onboarding/complete` is
 * tolerant of missing payload fields (mood, lifeAreas, demographics)
 * — they default to schema defaults. So a user who completed the
 * old 11-step flow keeps their state; a user mid-old-flow resumes
 * at new step 1 with no data loss.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  { step: 1, title: "How we process your voice", Component: Step5AiConsent },
  { step: 2, title: "Microphone access", Component: Step4Microphone },
  { step: 3, title: "Practice round", Component: Step5Practice },
  { step: 4, title: "Reminders", Component: Step9Reminders },
  { step: 5, title: "Ready when you are", Component: Step10Ready },
];
