import { useEffect } from "react";
import { router } from "expo-router";

import { isOnboardingV10Enabled } from "@/lib/feature-flags";
import V10Start from "./_v10/start";

/**
 * Route for the v10 first screen (1.9.1): "I'm new" / "I have an account".
 * v10-only; with the flag off, go to sign-in.
 */
export default function StartRoute() {
  const enabled = isOnboardingV10Enabled();
  useEffect(() => {
    if (enabled) return;
    router.replace("/(auth)/sign-in");
  }, [enabled]);
  return enabled ? <V10Start /> : null;
}
