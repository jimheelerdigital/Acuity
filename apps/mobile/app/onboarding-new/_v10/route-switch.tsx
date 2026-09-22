import { useEffect } from "react";
import { router } from "expo-router";

import { isOnboardingV10Enabled } from "@/lib/feature-flags";

/**
 * Route-level switching between v10 and the existing onboarding-v2 flow.
 *
 * ── Why the routes are shared rather than new ────────────────────────
 * Keenan's Meta ads deep-link into /onboarding-new/* paths that are live
 * right now. Creating /onboarding-v10/* routes would have been tidier in the
 * file tree and would have broken every one of those links. So v10 replaces
 * what renders BEHIND the existing route names, and the flag decides which.
 *
 * ── The flag-OFF contract ────────────────────────────────────────────
 * Spec §9 acceptance: "Remote flag OFF restores previous flow without data
 * loss." That is the reason nothing is deleted and every legacy screen stays
 * intact. With the flag off, these wrappers render the original component
 * unchanged — same file, same props, same behaviour. The only thing added to
 * the flag-OFF path is one boolean read.
 *
 * `isOnboardingV10Enabled()` reads a Metro-inlined constant, so this is a
 * comparison against a literal after bundling, not a runtime lookup.
 */

/**
 * Render one of two components based on the flag.
 *
 * Both are passed as elements rather than component types so neither side
 * mounts unless it is selected — the legacy recording screen in particular
 * has heavy side effects on mount (audio session setup) that must not fire
 * when v10 is active.
 */
export function V10Switch({
  v10,
  legacy,
}: {
  v10: React.ReactNode;
  legacy: React.ReactNode;
}): React.ReactElement {
  return <>{isOnboardingV10Enabled() ? v10 : legacy}</>;
}

/**
 * For routes that exist ONLY in the legacy flow (q1–q5, bridge,
 * how-it-works, commitment, disclosure).
 *
 * v10 collapses eleven pre-record screens into two, so these have no v10
 * equivalent. When the flag is on we send the user to the start of the v10
 * flow rather than rendering a screen from a flow they are not in — a stale
 * deep link or a back-swipe should land somewhere coherent, not in a
 * half-abandoned funnel.
 *
 * Redirecting to Screen 1 (not straight to the recorder) is deliberate: the
 * branch choice made there drives the mirror line, the recording sub-prompt
 * and the reveal fallback. Skipping it would leave all of those unpersonalized.
 *
 * Returns whether the redirect fired, so the caller can render null instead
 * of flashing legacy content for a frame.
 */
export function useV10RedirectIfEnabled(): boolean {
  const enabled = isOnboardingV10Enabled();

  useEffect(() => {
    if (!enabled) return;
    // replace, not push — this screen should not be in the back stack of a
    // flow it does not belong to.
    router.replace("/onboarding-new/pain");
  }, [enabled]);

  return enabled;
}
