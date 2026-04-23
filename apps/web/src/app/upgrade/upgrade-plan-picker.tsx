"use client";

import posthog from "posthog-js";
import { useEffect, useState } from "react";

type Interval = "monthly" | "yearly";

/**
 * Plan picker + checkout CTA on /upgrade. Owns the monthly/yearly
 * selection state so the price card re-renders in place when the user
 * toggles. POSTs the selected interval to /api/stripe/checkout.
 *
 * Yearly math, locked in PROGRESS.md 2026-04-23 (pricing):
 *   $12.99/mo × 12 = $155.88   → $99/yr saves $56.88 (~36%)
 *   $99/yr / 12     = $8.25/mo effective
 */
export function UpgradePlanPicker() {
  const [interval, setInterval] = useState<Interval>("yearly");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof fbq !== "undefined") {
      fbq("track", "InitiateCheckout");
    }
  }, []);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const src = new URLSearchParams(window.location.search).get("src");
      posthog.capture("upgrade_page_cta_clicked", {
        ctaVariant: "start_free_trial_button",
        source: src ?? "direct",
        interval,
      });
    } catch {
      // PostHog may not be initialized in dev — no-op.
    }
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
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
    <>
      <div
        role="tablist"
        aria-label="Billing interval"
        className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-zinc-100 dark:bg-[#13131F] p-1 text-sm"
      >
        <IntervalTab
          label="Monthly"
          selected={interval === "monthly"}
          onClick={() => setInterval("monthly")}
        />
        <IntervalTab
          label="Yearly"
          selected={interval === "yearly"}
          onClick={() => setInterval("yearly")}
          badge="Save 36%"
        />
      </div>

      <div className="mb-6">
        {interval === "monthly" ? (
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              $12.99
            </span>
            <span className="text-sm text-zinc-400 dark:text-zinc-500">
              /month
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                $99
              </span>
              <span className="text-sm text-zinc-400 dark:text-zinc-500">
                /year
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Just $8.25/month, billed annually. Save $56.88 vs monthly.
            </p>
          </>
        )}
      </div>

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
    </>
  );
}

function IntervalTab({
  label,
  selected,
  onClick,
  badge,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`rounded-full py-2 text-sm font-medium transition ${
        selected
          ? "bg-white text-zinc-900 shadow-sm dark:bg-[#1E1E2E] dark:text-zinc-50"
          : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      <span className="flex items-center justify-center gap-1.5">
        {label}
        {badge && (
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
            {badge}
          </span>
        )}
      </span>
    </button>
  );
}
