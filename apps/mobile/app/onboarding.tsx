import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import {
  ONBOARDING_STEPS,
  OnboardingShell,
} from "@/components/onboarding";

/**
 * Mobile counterpart to apps/web/src/app/onboarding/page.tsx.
 * URL-driven — `/onboarding?step=N` drops the user at step N. On
 * first visit the AuthGate in _layout.tsx resolves the user's last-
 * seen step from /api/user/me and replaces the URL to that value, so
 * re-launches resume cleanly.
 *
 * Hidden native header (the shell owns its own chrome). Clamp step to
 * the legal range so a stale deep link doesn't render a blank screen.
 */

function clampStep(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > ONBOARDING_STEPS.length) return ONBOARDING_STEPS.length;
  return Math.round(n);
}

export default function OnboardingScreen() {
  const params = useLocalSearchParams<{ step?: string }>();

  const step = useMemo(() => {
    const raw = Array.isArray(params.step) ? params.step[0] : params.step;
    return clampStep(Number(raw ?? 1));
  }, [params.step]);

  const entry = ONBOARDING_STEPS.find((s) => s.step === step);
  if (!entry) return null;

  const StepComponent = entry.Component;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <OnboardingShell step={step} totalSteps={ONBOARDING_STEPS.length}>
        <StepComponent />
      </OnboardingShell>
    </>
  );
}
