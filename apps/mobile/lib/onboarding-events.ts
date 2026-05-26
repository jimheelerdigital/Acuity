/**
 * Mobile onboarding-v2 funnel events. Slice 7 (2026-05-26) — typed
 * helper introduced now so the slice 7 commitment screen has the
 * right call sites in place. The network surface (POST to
 * /api/onboarding-events with the anon device id) lands in slice
 * 11's analytics pass — until then this is a dev-log no-op.
 *
 * Event names mirror the web funnel's whitelist (see
 * apps/web/src/app/api/onboarding-events/route.ts; Keenan added 13
 * funnel_* events when /start shipped). Keeping mobile names
 * identical means the slice 11 analytics POST joins cleanly with
 * web's funnel rollup — same event vocabulary across both surfaces.
 */

export type OnboardingEventName =
  | "funnel_pain_viewed"
  | "funnel_diagnostic_1_completed"
  | "funnel_diagnostic_2_completed"
  | "funnel_diagnostic_3_completed"
  | "funnel_diagnostic_cost"
  | "funnel_diagnostic_desire"
  | "funnel_bridge_viewed"
  | "funnel_promise_viewed"
  | "funnel_commitment_started"
  | "funnel_commitment_completed"
  | "funnel_commitment_abandoned"
  | "funnel_recording_started"
  | "funnel_recording_completed"
  | "funnel_processing_viewed"
  | "funnel_extraction_viewed"
  | "funnel_signup_started"
  | "funnel_signup_completed"
  | "funnel_paywall_viewed"
  | "funnel_trial_started"
  | "funnel_paywall_dismissed";

/**
 * Fire an onboarding funnel event. No-op stub for now — slice 11
 * wires this to a POST against /api/onboarding-events carrying the
 * anonDeviceId from lib/try-session so the unauthenticated mobile
 * funnel ties back to the same TrySession row at claim time.
 *
 * Always returns a resolved Promise so call sites can `await` or
 * fire-and-forget without branching. Never throws.
 */
export async function trackOnboardingEvent(
  eventName: OnboardingEventName,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[onboarding-events]", eventName, metadata ?? {});
  }
  // Slice 11 will replace this with:
  //   const anonDeviceId = await getOrCreateAnonDeviceId();
  //   await api.post("/api/onboarding-events", { eventName,
  //     anonDeviceId, metadata });
  // For now we swallow so the call sites are correct in shape but
  // the network surface stays deferred.
}
