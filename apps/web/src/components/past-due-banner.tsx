"use client";

import { useEffect, useState } from "react";

/**
 * Global "payment failed" recovery banner — persistent across every
 * authenticated screen (rendered once in AppShell). Self-gating: fetches
 * /api/user/me and renders only when `paymentFailed` is true (FREE because a
 * recent charge failed, within the 30-day window; computed server-side per
 * subscriptionSource). Action-only, no dismiss.
 *
 * No grace (2026-06-12 spec): a failed payment drops the user to FREE
 * immediately — so the copy says "get Pro back", not "nothing's cut off".
 * The action routes to the right place per source:
 *   stripe       → POST /api/stripe/portal (Customer Portal)
 *   apple        → App Store subscriptions
 *   google_play  → Play Store subscriptions
 */
export function PastDueBanner() {
  const [show, setShow] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: { user?: { paymentFailed?: boolean; subscriptionSource?: string } } | null
        ) => {
          if (!cancelled && d?.user?.paymentFailed) {
            setShow(true);
            setSource(d.user.subscriptionSource ?? null);
          }
        }
      )
      .catch(() => {
        /* not signed in / network — show nothing */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  const updatePayment = async () => {
    if (source === "apple") {
      window.location.href = "https://apps.apple.com/account/subscriptions";
      return;
    }
    if (source === "google_play") {
      window.location.href =
        "https://play.google.com/store/account/subscriptions";
      return;
    }
    // stripe (default): open the Customer Portal.
    setSubmitting(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        redirect?: string;
      };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
    } catch {
      /* leave the banner up; user can retry */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-5 py-3"
      style={{
        borderBottomWidth: 1,
        borderBottomStyle: "solid",
        borderBottomColor: "var(--acuity-warn)",
        backgroundColor:
          "color-mix(in oklch, var(--acuity-warn), transparent 88%)",
      }}
    >
      <span className="text-base leading-none" aria-hidden="true">
        ⚠️
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="font-display text-sm font-semibold"
          style={{ color: "var(--acuity-warn)" }}
        >
          Your payment didn&rsquo;t go through
        </p>
        <p className="text-xs text-acuity-text-sec">
          Update your payment method to get Ripple Pro back.
        </p>
      </div>
      <button
        type="button"
        onClick={updatePayment}
        disabled={submitting}
        className="shrink-0 rounded-acuity-pill px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--acuity-warn)" }}
      >
        {submitting ? "Opening…" : "Update payment"}
      </button>
    </div>
  );
}
