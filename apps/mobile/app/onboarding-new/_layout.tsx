import { Stack } from "expo-router";

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
 * Stack animations stay at expo-router defaults; the per-screen
 * fade/translate compositions live inside each screen using
 * react-native-reanimated.
 */
export default function OnboardingNewLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Match the rest of the app — gestureEnabled so a swipe-back
        // can interrupt a screen, but back-button behavior is
        // suppressed via headerShown=false. Individual screens
        // (pain, recording, paywall) override gestureEnabled as
        // needed for moments where back navigation would corrupt
        // the funnel state.
        animation: "fade",
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
