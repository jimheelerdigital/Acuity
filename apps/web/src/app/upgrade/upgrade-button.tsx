"use client";

import posthog from "posthog-js";
import { useEffect, useState } from "react";

export function UpgradeButton() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof fbq !== "undefined") {
      fbq("track", "InitiateCheckout");
    }
  }, []);

  const handleUpgrade = async () => {
    setLoading(true);
    // PostHog CTA event (IMPLEMENTATION_PLAN_PAYWALL §8.3). `ctaVariant`
    // is set to `start_free_trial_button` for MVP — we'll branch on
    // trialing vs post-trial status when the copy-variants ship per
    // plan §1.2.
    try {
      const src = new URLSearchParams(window.location.search).get("src");
      posthog.capture("upgrade_page_cta_clicked", {
        ctaVariant: "start_free_trial_button",
        source: src ?? "direct",
      });
    } catch {
      // PostHog may not be initialized in dev — no-op.
    }
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleUpgrade}
      disabled={loading}
      className="w-full rounded-xl bg-zinc-900 py-3.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-all duration-200 disabled:opacity-50 hover:shadow-lg hover:shadow-zinc-900/10 active:scale-[0.98]"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Redirecting...
        </span>
      ) : (
        "Start Free Trial"
      )}
    </button>
  );
}
