import { createContext, useContext } from "react";

/**
 * Shared state between the OnboardingShell (owns navigation +
 * persistence) and each step component (owns its answer).
 *
 * Mirror of apps/web/src/app/onboarding/onboarding-context.tsx — the
 * symmetry is deliberate so the mobile step files read like their web
 * siblings, and a future extraction into packages/shared/onboarding is
 * a rename instead of a rewrite.
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
