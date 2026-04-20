"use client";

import posthog from "posthog-js";

/**
 * Client-side analytics helper. Mirrors the server-side `track()` from
 * @/lib/posthog so call-sites look the same regardless of which side
 * they live on. Use this one from any `"use client"` component.
 *
 * Fails open when `NEXT_PUBLIC_POSTHOG_KEY` is unset — the PostHog
 * client's `posthog.init()` runs only when the key is provided (see
 * components/posthog-provider.tsx), so `posthog.capture()` on an
 * uninitialized client is a no-op.
 *
 * No PII sanitization here because client-side events never include
 * raw user fields — call-sites pass only the semantic props (step
 * number, selected answers). The server-side `track()` does sanitize
 * because it's called from API routes where raw email/name can leak
 * in.
 */

// Narrow to the onboarding subset — the only client-side events today.
// Kept as a literal union so a typo is a compile error.
export type ClientAnalyticsEvent =
  | "onboarding_started"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "onboarding_skipped";

export function trackClient(
  event: ClientAnalyticsEvent,
  properties: Record<string, unknown> = {}
): void {
  try {
    posthog.capture(event, properties);
  } catch {
    // Never let analytics break the UI.
  }
}
