"use client";

import { useEffect, useRef } from "react";
import { FunnelConfigProvider, OnboardingFunnel } from "@/components/onboarding-funnel";
import { DEFAULT_FUNNEL_CONFIG, type EntryIntro } from "@/lib/funnel-config";

/**
 * Client wrapper for the onboarding funnel. On mount:
 * 1. Hides the SSR entry question (if present)
 * 2. Renders the full interactive funnel
 *
 * The SSR entry question stays visible until this component mounts,
 * ensuring content is visible even on slow connections.
 */
export function StartPageClient({ skipSSR, entryIntro }: { skipSSR?: boolean; entryIntro?: EntryIntro }) {
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      if (!require("@/lib/internal-traffic").isInternalClient()) try {
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

  // Ad-matched screen 1 (2026-09-30): the server built this ad's intro.
  if (!entryIntro) return <OnboardingFunnel />;
  return (
    <FunnelConfigProvider config={{ ...DEFAULT_FUNNEL_CONFIG, ENTRY_INTRO: entryIntro }}>
      <OnboardingFunnel />
    </FunnelConfigProvider>
  );
}
