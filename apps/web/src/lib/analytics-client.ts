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

// Client-side analytics events. Kept as a literal union so a typo is a
// compile error.
export type ClientAnalyticsEvent =
  | "onboarding_started"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "onboarding_skipped"
  // Install banner (web → native activation) — components/install-banner.tsx
  | "install_banner_shown"
  | "install_banner_clicked"
  | "install_banner_dismissed"
  | "install_banner_render_skipped"
  // Inline install CTAs in marketing content — components/inline-install-cta.tsx
  | "install_banner_inline_shown"
  | "install_banner_inline_clicked"
  // Desktop QR bridge — components/install-qr.tsx + app/install page
  | "install_qr_shown"
  | "install_page_visit";

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
