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

function getClient(): PostHog | null {
  if (_client) return _client;
  const key = process.env.POSTHOG_API_KEY;
  if (!key) {
    if (!_warned) {
      console.warn(
        "[posthog] POSTHOG_API_KEY not set — events dropped. Set via Vercel env to enable analytics."
      );
      _warned = true;
    }
    return null;
  }
  const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
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
  | "subscription_started";

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
