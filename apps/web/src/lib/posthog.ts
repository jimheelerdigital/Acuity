import "server-only";

import { PostHog } from "posthog-node";

import { __sanitize_for_tests as sanitize } from "@/lib/safe-log";

/**
 * Server-side PostHog client + `track()` helper. Lazy-initialized so
 * Next.js build doesn't fail when POSTHOG_API_KEY is unset (e.g.
 * local dev without PostHog wired). Fails open with a single
 * warning — same pattern as lib/rate-limit.ts — so a missing env
 * var never breaks product behavior.
 *
 * IMPLEMENTATION_PLAN_PAYWALL §8. All event properties are piped
 * through the safeLog sanitizer before send: hashed email, redacted
 * transcript/name/audio fields. PostHog never sees raw PII.
 *
 * Usage:
 *   await track(userId, "trial_started", {
 *     signupSource: "organic",
 *     email: user.email,       // auto-hashed by sanitize()
 *     trialEndsAt: trialEndsAt.toISOString(),
 *   });
 *
 *   // Anonymous (pre-auth) events — pass null userId + an
 *   // anonymousId keyed to the session or a stable device/IP hash:
 *   await track(null, "upgrade_page_viewed", { source: "email" }, "anon-abc");
 */

let _client: PostHog | null = null;
let _warned = false;

/**
 * Which key and host the server sends events with (2026-10-23).
 *
 * Event capture only accepts a PROJECT key (phc_…). Production had
 * POSTHOG_API_KEY set to a PERSONAL key (phx_…), so every server event since
 * at least June was rejected with "API key is not valid: personal_api_key"
 * (trial_started, subscription_started, first_recording_completed, …).
 * Personal keys are for PostHog's read API, never capture.
 *
 * So: use POSTHOG_API_KEY only when it is a project key, otherwise the web
 * client's NEXT_PUBLIC_POSTHOG_KEY (the same project; project keys are
 * write-only and already public in the browser bundle). Same for the host:
 * the server must talk to the project's region, and the client's host is
 * the one known to work. A relative proxy path can't be used server-side.
 */
export function resolvePosthogConfig(env: Record<string, string | undefined>): {
  key: string | null;
  host: string;
  ignoredPersonalKey: boolean;
} {
  const isProjectKey = (k: string | undefined): k is string => !!k && k.startsWith("phc_");
  const serverKey = env.POSTHOG_API_KEY?.trim();
  const publicKey = env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const key = isProjectKey(serverKey) ? serverKey : isProjectKey(publicKey) ? publicKey : null;
  const absolute = (h: string | undefined) => (h && /^https:\/\//.test(h.trim()) ? h.trim() : null);
  const host = absolute(env.POSTHOG_HOST) ?? absolute(env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://us.i.posthog.com";
  return { key, host, ignoredPersonalKey: !!serverKey && serverKey.startsWith("phx_") };
}

function getClient(): PostHog | null {
  if (_client) return _client;
  const { key, host, ignoredPersonalKey } = resolvePosthogConfig(process.env);
  if (!key) {
    if (!_warned) {
      console.warn(
        "[posthog] no PostHog project key (phc_…) in POSTHOG_API_KEY or NEXT_PUBLIC_POSTHOG_KEY — events dropped."
      );
      _warned = true;
    }
    return null;
  }
  if (ignoredPersonalKey && !_warned) {
    console.warn("[posthog] POSTHOG_API_KEY is a personal key (phx_…); using the project key for capture.");
    _warned = true;
  }
  _client = new PostHog(key, { host });
  return _client;
}

/**
 * Canonical events from IMPLEMENTATION_PLAN_PAYWALL §8.3. Keep
 * literal string-union typed so a typo is a compile error.
 */
export type AnalyticsEvent =
  | "trial_started"
  | "life_audit_generated"
  | "life_audit_viewed"
  | "upgrade_page_viewed"
  | "upgrade_page_cta_clicked"
  | "subscription_started"
  // Onboarding flow — fired client-side from the 8-step walkthrough.
  // `onboarding_started`        step 1 mount
  // `onboarding_step_completed` after each step advance (sanitized step
  //                             + any captured answer keys — moodBaseline,
  //                             selected life-area enums, microphone
  //                             granted boolean)
  // `onboarding_completed`      natural finish on step 8
  // `onboarding_skipped`        user tapped "Skip for now" in the
  //                             top-right and confirmed — payload
  //                             includes skippedAtStep so we can see
  //                             where the drop clusters
  | "onboarding_started"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "onboarding_skipped"
  // Streak milestone celebrations — fired exactly once per user per
  // milestone (7/30/100) when currentStreak first crosses the mark.
  // Monotonic via User.lastStreakMilestone; resetting to 0 and
  // re-climbing doesn't re-fire the same milestone.
  | "streak_milestone_hit"
  // Recording extraction review — fired when the user commits or
  // skips the tasks+goals that Claude extracted from an entry. Props
  // carry tasksProposed/tasksCommitted/goalsProposed/goalsCommitted
  // so we can tune the extraction prompt against real signal-to-noise.
  | "entry_extraction_reviewed"
  // Acquisition funnel events — signup flow instrumentation
  | "signup_page_viewed"
  | "start_trial_cta_clicked"
  | "first_recording_completed"
  // A/B experiment tracking
  | "experiment_variant_assigned";

/**
 * Fire an analytics event. Safe on missing env config (no-op). Safe
 * on PII in the properties payload (sanitizer redacts known keys).
 *
 * @param userId        Authenticated user ID, or null for anonymous events.
 * @param event         One of the typed AnalyticsEvent strings.
 * @param properties    Arbitrary key/value metadata. PII keys are
 *                      sanitized before send.
 * @param anonymousId   For null-userId events, a stable anon
 *                      identifier (session ID, device hash). Falls
 *                      back to "anonymous" if omitted.
 */
export async function track(
  userId: string | null,
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {},
  anonymousId?: string
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const cleanProps = sanitize(properties) as Record<string, unknown>;

  try {
    if (userId) {
      client.capture({
        distinctId: userId,
        event,
        properties: cleanProps,
      });
    } else {
      client.capture({
        distinctId: anonymousId ?? "anonymous",
        event,
        properties: cleanProps,
      });
    }
  } catch (err) {
    // Never let an analytics call crash the calling code path.
    console.warn("[posthog] capture failed (non-fatal):", err);
  }
}

/**
 * Flush pending events. Server-side PostHog batches in memory; call
 * this from long-running scripts or before process exit. Normal
 * request handlers don't need to call it — PostHog's auto-flush on
 * a timer handles the typical serverless-function lifecycle.
 */
export async function flushAnalytics(): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.shutdown();
}
