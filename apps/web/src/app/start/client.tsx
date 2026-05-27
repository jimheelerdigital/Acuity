"use client";

import { useEffect, useRef } from "react";
import { OnboardingFunnel } from "@/components/onboarding-funnel";

/**
 * Client wrapper for the onboarding funnel. On mount:
 * 1. Hides the SSR pain hook (if present)
 * 2. Renders the full interactive funnel
 *
 * The SSR pain hook stays visible until this component mounts,
 * ensuring content is visible even on slow connections.
 */
export function StartPageClient({
  hook,
  skipSSR,
}: {
  hook: { headline: string; subheadline: string } | null;
  skipSSR?: boolean;
}) {
  const mounted = useRef(false);

  useEffect(() => {
    // Hide the SSR pain hook once the client takes over
    if (!mounted.current) {
      mounted.current = true;
      const ssrEl = document.getElementById("ssr-pain-hook");
      if (ssrEl) ssrEl.style.display = "none";

      // Wire up the SSR continue button to trigger client navigation
      // (in case user clicks before React hydrates — edge case)
      const btn = document.getElementById("ssr-continue-btn");
      if (btn) btn.style.display = "none";
    }
  }, []);

  return <OnboardingFunnel ssrHook={hook} />;
}
