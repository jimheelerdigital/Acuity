"use client";

import { useEffect, useState } from "react";

/**
 * Global PAST_DUE banner — persistent across every authenticated screen
 * (rendered once in AppShell). Self-gating: fetches /api/user/me and only
 * renders when subscriptionStatus === "PAST_DUE" (a 401 / any other status
 * renders nothing, so it's safe on marketing + auth pages too).
 *
 * Action-only (no dismiss X): "Update payment" opens the Stripe Customer
 * Portal via POST /api/stripe/portal. Parity with the iOS/Android banner.
 * Server gate (entitlements.ts) keeps access during the 21-day grace; this is
 * the user-facing signal to fix the card before it lapses.
 */
export function PastDueBanner() {
  const [pastDue, setPastDue] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { subscriptionStatus?: string } } | null) => {
        if (!cancelled && d?.user?.subscriptionStatus === "PAST_DUE") {
          setPastDue(true);
        }
      })
      .catch(() => {
        /* not signed in / network — show nothing */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pastDue) return null;

  const updatePayment = async () => {
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
          Update your card to keep your insights. Nothing&rsquo;s cut off right
          away — Stripe retries over the next couple of weeks.
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
