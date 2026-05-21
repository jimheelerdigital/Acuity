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
  /** Read previously-captured data for the current step (or any
   *  step). Used by step components to rehydrate their local form
   *  state on remount, so back-nav doesn't wipe prior answers. */
  getCapturedData: (step: number) => Record<string, unknown> | null;
  /** Hide the shell's Continue/Back footer for the current step.
   *  Steps that ship their own internal Continue button (e.g. the
   *  Phase C life-matrix baseline carousel which advances through
   *  10 sub-axes) call setHideShellChrome(true) on mount and false
   *  on unmount. */
  setHideShellChrome: (hide: boolean) => void;
  /** Programmatically trigger the shell's next-step routing. Steps
   *  with their own internal Continue use this to advance the outer
   *  flow after their own logic has captured the payload via
   *  setCapturedData. */
  goNext: () => void;
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
