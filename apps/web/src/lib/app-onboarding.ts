/**
 * What the mobile app is told about onboarding (2026-10-04, URGENT fix).
 *
 * The app's AuthGate (apps/mobile/app/_layout.tsx → decideColdStartRoute)
 * re-runs on EVERY screen change. For a signed-in PRO user whose onboarding
 * isn't complete it returns "home" (the Apple 3.1.3(b) pay-on-web bypass) and
 * router.replace("/(tabs)") fires, so opening /record (or any non-tab
 * screen) is instantly bounced back home. To web buyers every record button
 * looked dead (Christine Carty, 2026-10-04: "none of the microphone buttons
 * actually work"), and none of the recent web-paid app users had recorded.
 *
 * PRO users are never routed through mobile onboarding anyway, so reporting
 * them as onboarded changes nothing except removing the bounce. Works on the
 * shipped app builds: no release needed. The app-side fix (only bypass from
 * auth/onboarding/root segments) is for Jimmy's next release.
 */
export function appOnboardingCompleted(
  completedAt: Date | null | undefined,
  subscriptionStatus: string | null | undefined,
  subscriptionSource?: string | null
): boolean {
  // Web TRIAL (a Stripe card trial from the funnel) too (2026-10-06,
  // Christine Carty again: she's TRIAL, not PRO, so the PRO-only rule still
  // bounced her). Their onboarding happened in the web funnel. In-app trials
  // (apple/google) are left alone: they start mid-app-onboarding, which must
  // finish.
  return (
    Boolean(completedAt) ||
    subscriptionStatus === "PRO" ||
    (subscriptionStatus === "TRIAL" && subscriptionSource === "stripe")
  );
}
