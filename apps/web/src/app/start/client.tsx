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

      // Set attribution cookie so UTMs survive the OAuth redirect
      try {
        const { setAttributionCookie } = require("@/lib/attribution");
        setAttributionCookie();
      } catch {}

      // Fire server-side Meta CAPI PageView for /start (bypasses ad blockers)
      try {
        const params = new URLSearchParams(window.location.search);
        fetch("/api/capi/pageview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: window.location.href,
            fbclid: params.get("fbclid") || undefined,
          }),
        }).catch(() => {});
      } catch {}
    }
  }, []);

  return <OnboardingFunnel />;
}
