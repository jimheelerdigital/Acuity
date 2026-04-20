"use client";

import posthog from "posthog-js";
import { PostHogProvider as PostHogReactProvider } from "posthog-js/react";
import { useEffect } from "react";

/**
 * Client-side PostHog initialization. Mounted once in the root
 * layout so the SDK is ready before any page fires an event.
 *
 * Env shape:
 *   NEXT_PUBLIC_POSTHOG_KEY  — the PostHog project API key. Public
 *                              by design (PostHog uses it for
 *                              client-side capture; it's rate-limited
 *                              + origin-checked server-side).
 *   NEXT_PUBLIC_POSTHOG_HOST — optional proxy host. Defaults to
 *                              https://us.i.posthog.com.
 *
 * No-op when NEXT_PUBLIC_POSTHOG_KEY is unset — safe to ship without
 * PostHog provisioned (dev, staging, and the first production deploy
 * before the account is set up).
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    // Guard double-init (React StrictMode fires effects twice in dev).
    if ((posthog as unknown as { __loaded?: boolean }).__loaded) return;
    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      // Hard-disable session replay by default — mental-health-adjacent
      // content makes session recordings a privacy problem. Turn on
      // intentionally per-session when debugging with user consent.
      disable_session_recording: true,
      // Don't send IP. PostHog can still derive a coarse geo if it
      // sees one, but we don't want raw IPs in event payloads.
      ip: false,
      // PII scrubbing: drop URL params that look sensitive from the
      // auto-captured page events.
      mask_all_text: false,
      mask_all_element_attributes: false,
      // Respect Do Not Track.
      respect_dnt: true,
      persistence: "localStorage+cookie",
      autocapture: false, // opt in manually per event
      capture_pageview: true,
    });
    (posthog as unknown as { __loaded?: boolean }).__loaded = true;
  }, []);

  // If NEXT_PUBLIC_POSTHOG_KEY is unset, posthog.init never ran and
  // PostHogProvider is a passive wrapper (no capture). Safe to always
  // mount.
  return <PostHogReactProvider client={posthog}>{children}</PostHogReactProvider>;
}
