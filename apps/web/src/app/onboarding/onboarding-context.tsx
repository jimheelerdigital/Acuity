"use client";

import { createContext, useContext } from "react";

/**
 * Context plumbing between the OnboardingShell (which owns nav +
 * persistence) and each step component (which owns its answer).
 *
 * Shape:
 *   - `step`              current step number (1-10), from the URL
 *   - `setCanContinue`    each step calls this in an effect to tell
 *                         the shell whether its Continue button
 *                         should be enabled (e.g. step 6 requires
 *                         exactly 3 life areas selected)
 *   - `setCapturedData`   each step calls this with whatever fields
 *                         it wants persisted on Continue. The shell
 *                         bundles the latest value into one
 *                         POST /api/onboarding/update call before
 *                         advancing.
 */
export interface OnboardingContextValue {
  step: number;
  setCanContinue: (value: boolean) => void;
  setCapturedData: (data: Record<string, unknown> | null) => void;
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(
  null
);

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error(
      "useOnboarding must be used inside <OnboardingShell>"
    );
  }
  return ctx;
}
