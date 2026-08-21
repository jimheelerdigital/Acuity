import { useEffect } from "react";
import { router } from "expo-router";

import { isOnboardingV10Enabled } from "@/lib/feature-flags";
import V10Reminders from "./_v10/reminders";

/**
 * Route for v10 Screen 8 (Check-in time).
 *
 * v10-ONLY — the legacy flow has no equivalent step, so unlike the other
 * onboarding routes there is nothing to switch between. With the flag off
 * this route should never be reached; if it is (a stale deep link, a
 * back-swipe from a mixed stack), send the user to the app rather than
 * render a v10 screen inside a flow they are not in.
 */
export default function RemindersRoute() {
  const enabled = isOnboardingV10Enabled();

  useEffect(() => {
    if (enabled) return;
    router.replace("/(tabs)");
  }, [enabled]);

  return enabled ? <V10Reminders /> : null;
}
