"use client";

import { useEffect, useRef } from "react";
import { OnboardingFunnel, FunnelConfigProvider } from "@/components/onboarding-funnel";
import { BWK_FUNNEL_CONFIG } from "@/lib/funnel-config-bwk";

/**
 * Client wrapper for the men's/BWK onboarding funnel (/start-bwk).
 * Same mount behavior as /start's client (hide SSR entry, attribution cookie,
 * CAPI pageview), but renders the funnel with the BWK copy variant.
 */
export function StartBwkPageClient({ skipSSR }: { skipSSR?: boolean }) {
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

      // Fire server-side Meta CAPI PageView (bypasses ad blockers)
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

  return (
    <FunnelConfigProvider config={BWK_FUNNEL_CONFIG}>
      <OnboardingFunnel />
    </FunnelConfigProvider>
  );
}
