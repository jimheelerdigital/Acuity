/**
 * Mobile onboarding-v2 funnel events — slice 14 (2026-05-26) wires
 * the network surface that slices 7-12 left as a dev-log stub.
 *
 * Event names mirror the web funnel's VALID_EVENTS whitelist in
 * apps/web/src/app/api/onboarding-events/route.ts so a single
 * dashboard rolls up both surfaces. When a name diverges, this
 * file is the canary — TypeScript flags the call site and the
 * whitelist update lands in the same commit.
 *
 * Wire shape: POST /api/onboarding-events { event, value?, sessionToken? }
 * The endpoint's OnboardingEvent table has a single nullable string
 * `value` column. For richer payloads we encode JSON into that
 * column. For multi-select diagnostics we join with commas. Single-
 * select diagnostics use the raw answer key. Dashboards parse on
 * read — small price for keeping the schema flat.
 *
 * Auth: Bearer token via getToken() when the user is authenticated.
 * For the anon pre-signup arc (pain → q1..q5 → bridge → promise →
 * commitment → record → reveal) we fall back to the AsyncStorage
 * try_session_token so events still tie to the same TrySession row.
 * Both paths fail-soft — analytics never blocks the user flow.
 */

import Constants from "expo-constants";

import { getToken } from "@/lib/auth";
import { getStoredTrySessionToken } from "@/lib/try-session";

export type OnboardingEventName =
  // Hook + diagnostics (web-canonical names — funnel rollup parity)
  | "funnel_pain_hook_viewed"
  | "funnel_diagnostic_loop"
  | "funnel_diagnostic_duration"
  | "funnel_diagnostic_attempts"
  | "funnel_diagnostic_cost"
  | "funnel_diagnostic_desire"
  | "funnel_failed_solution_viewed"
  | "funnel_promise_viewed"
  | "funnel_mechanism_viewed"
  // Commitment + recording
  | "funnel_commitment_started"
  | "funnel_commitment_completed"
  | "funnel_commitment_abandoned"
  | "funnel_recording_started"
  | "funnel_recording_completed"
  | "funnel_processing_viewed"
  | "funnel_extraction_viewed"
  // Signup + paywall
  | "funnel_signup_started"
  | "funnel_signup_completed"
  | "funnel_signup_failed"
  | "funnel_paywall_viewed"
  | "funnel_trial_started"
  | "funnel_paywall_dismissed";

export interface TrackOptions {
  /** Single-select answer key, signup method, error code, etc. */
  value?: string;
  /** Multi-select answers — joined with commas into the value column. */
  values?: readonly string[];
  /**
   * Free-form payload — JSON-encoded into the value column. Prefer
   * value/values where possible; metadata is a fallback for events
   * that genuinely need structured data (paywall view + signup
   * outcome). Keys are kept short to fit the column size.
   */
  metadata?: Record<string, unknown>;
}

function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as
    | { apiUrl?: string }
    | undefined;
  return (
    process.env.EXPO_PUBLIC_API_URL ??
    extra?.apiUrl ??
    "https://getacuity.io"
  );
}

function encodeValue(opts?: TrackOptions): string | undefined {
  if (!opts) return undefined;
  if (opts.value !== undefined) return opts.value;
  if (opts.values && opts.values.length > 0) return opts.values.join(",");
  if (opts.metadata) {
    try {
      return JSON.stringify(opts.metadata);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Fire an onboarding funnel event. Fail-soft — every failure path
 * swallows so analytics never breaks the user flow.
 *
 * Auth resolution order: session token (signed-in users) → anon
 * try_session_token (pre-signup arc). One of the two should be
 * present by the time any event fires; the API accepts the call
 * even with neither and stores an orphan row that still contributes
 * to funnel counts.
 */
export async function trackOnboardingEvent(
  eventName: OnboardingEventName,
  opts?: TrackOptions
): Promise<void> {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[onboarding-events]", eventName, opts ?? {});
  }

  try {
    const [bearer, trySessionToken] = await Promise.all([
      getToken().catch(() => null),
      getStoredTrySessionToken().catch(() => null),
    ]);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;

    const body: Record<string, unknown> = { event: eventName };
    const value = encodeValue(opts);
    if (value !== undefined) body.value = value;
    if (!bearer && trySessionToken) body.sessionToken = trySessionToken;

    await fetch(`${apiBaseUrl()}/api/onboarding-events`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    // Swallow — never block the user flow for analytics.
  }
}
