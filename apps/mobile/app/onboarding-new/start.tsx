import { useEffect, useState } from "react";
import { router } from "expo-router";

import { isOnboardingV10Enabled } from "@/lib/feature-flags";
import { getPendingTryJob } from "@/lib/try-session";
import V10Start from "./_v10/start";

/**
 * Route for the v10 first screen (1.9.1): "I'm new" / "I have an account".
 * v10-only; with the flag off, go to sign-in.
 *
 * 2026-10-20: a signed-out cold launch lands here. If a first debrief was
 * mid-analysis when the app was closed (or killed), go back to the
 * processing screen to collect the result the server finished saving,
 * instead of making her start the funnel over. This also catches a launch
 * from the "Your list is ready" push.
 */
export default function StartRoute() {
  const enabled = isOnboardingV10Enabled();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!enabled) {
      router.replace("/(auth)/sign-in");
      return;
    }
    let live = true;
    void getPendingTryJob().then((job) => {
      if (!live) return;
      if (job) router.replace({ pathname: "/onboarding-new/processing", params: { resume: "1" } } as never);
      else setChecked(true);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return enabled && checked ? <V10Start /> : null;
}
