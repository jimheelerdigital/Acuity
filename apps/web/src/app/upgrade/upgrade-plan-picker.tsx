"use client";

import posthog from "posthog-js";
import { useEffect, useState } from "react";

import {
  ANNUAL_AS_MONTHLY_CENTS,
  ANNUAL_PRICE_CENTS,
  MONTHLY_PRICE_CENTS,
  PRICING,
  formatDollars,
} from "@/lib/pricing";

type Interval = "monthly" | "yearly";

/**
 * Plan picker + checkout CTA on /upgrade. Owns the monthly/yearly
 * selection state so the price card re-renders in place when the user
 * toggles. POSTs the selected interval to /api/stripe/checkout.
 *
 * Price strings are derived from `lib/pricing.PRICING` so any future
 * change is a single-file edit. 2026-05-25: the prior literals
 * ($99, $8.25, $56.88, Save 36%) were stale post-slice-1 — Stripe
 * was charging $39.99 while the page kept advertising $99. This
 * surface now reads from the same source as the checkout route's
 * Stripe Price IDs (env-var-driven; PRICING holds the displayed
 * dollar values).
 */
const YEARLY_SAVINGS_DOLLARS_ROUNDED = (() => {
  const monthlyRunCents = MONTHLY_PRICE_CENTS * 12;
  const savings = monthlyRunCents - ANNUAL_PRICE_CENTS;
  return formatDollars(savings);
})();
export function UpgradePlanPicker() {
  const [interval, setInterval] = useState<Interval>("yearly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      console.log('[meta-pixel] Firing ViewContent — Pricing Page');
      window.fbq("track", "ViewContent", { content_name: "Pricing Page" });
      console.log('[meta-pixel] Firing InitiateCheckout');
      window.fbq("track", "InitiateCheckout", { content_name: "Upgrade Page" });
    }
  }, []);

  const handleUpgrade = async () => {
    setError(null);
    setLoading(true);
    try {
      const src = new URLSearchParams(window.location.search).get("src");
      posthog.capture("upgrade_page_cta_clicked", {
        ctaVariant: "subscribe_now_button",
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
        setError("Checkout returned no redirect URL. Try again.");
      } else if (res.status === 401) {
        // Session dropped between page render + checkout click. Push
        // the user to sign-in with a callback to land them back here.
        window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent("/upgrade")}`;
        return;
      } else {
        const body = await res.json().catch(() => ({}));
        setError(
          typeof body?.error === "string"
            ? `Couldn't start checkout: ${body.error}`
            : `Couldn't start checkout (status ${res.status}). Try again in a moment.`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't reach checkout: ${err.message}`
          : "Couldn't reach checkout. Check your connection and try again."
      );
    } finally {
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
          badge={`Save ${PRICING.annual.savingsVsMonthly}`}
        />
      </div>

      <div className="mb-6">
        {interval === "monthly" ? (
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              {formatDollars(MONTHLY_PRICE_CENTS)}
            </span>
            <span className="text-sm text-zinc-400 dark:text-zinc-500">
              /month
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                {formatDollars(ANNUAL_PRICE_CENTS)}
              </span>
              <span className="text-sm text-zinc-400 dark:text-zinc-500">
                /year
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Just {formatDollars(ANNUAL_AS_MONTHLY_CENTS)}/month, billed
              annually. Save {YEARLY_SAVINGS_DOLLARS_ROUNDED} vs monthly.
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
          "Subscribe Now"
        )}
      </button>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
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
          ? "bg-white text-zinc-900 shadow-sm dark:bg-acuity-card-bg dark:text-zinc-50"
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
