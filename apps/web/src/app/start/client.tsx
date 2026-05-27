"use client";

import { useEffect, useRef } from "react";
import { OnboardingFunnel } from "@/components/onboarding-funnel";

/**
 * Client wrapper for the onboarding funnel. On mount:
 * 1. Hides the SSR entry question (if present)
 * 2. Renders the full interactive funnel
 *
 * The SSR entry question stays visible until this component mounts,
 * ensuring content is visible even on slow connections.
 */
export function StartPageClient({ skipSSR }: { skipSSR?: boolean }) {
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      const ssrEl = document.getElementById("ssr-entry");
      if (ssrEl) ssrEl.style.display = "none";
    }
  }, []);

  return <OnboardingFunnel />;
}
