import { Stack } from "expo-router";

import { OnboardingProvider } from "@/contexts/onboarding-context";

/**
 * Pain-first onboarding flow — slices 2-9 of onboarding-v2.
 * Routes live under /onboarding-new/* so the existing
 * /onboarding/* post-signup flow is untouched and the feature
 * flag in slice 10 can switch between them at the AuthGate
 * level without renaming files.
 *
 * Header is suppressed on every screen — these screens own their
 * own chrome (the dark/light atmospheric flips are part of the
 * emotional arc; a system header would break the seal).
 *
 * OnboardingProvider wraps the Stack so q1/q2/q3 answers persist
 * across navigation between diagnostic screens. Reset happens
 * only on provider unmount (i.e. when the user leaves
 * /onboarding-new/* entirely) — back-stack navigation between
 * screens keeps prior answers, intentionally, so a user editing
 * Q1 doesn't lose Q2 / Q3.
 */
export default function OnboardingNewLayout() {
  return (
    <OnboardingProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </OnboardingProvider>
  );
}
