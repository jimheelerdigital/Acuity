"use client";

/**
 * Paywall extras (2026-09-30, per Keenan: "add the button in the paywall and
 * trust line and make sure it links properly").
 *
 * PayInBrowserButton — only inside the Instagram/Facebook in-app browser,
 * where Apple Pay / Google Pay usually don't show and buyers must type a
 * card. It opens Stripe's hosted checkout in the phone's real browser:
 *   iOS     → x-safari-https:// (iOS 17+ opens Safari from in-app browsers);
 *             if the page is still here after 1.5s, the checkout opens in
 *             place instead, so the tap never dead-ends.
 *   Android → an intent:// URL for Chrome, with the plain URL as fallback.
 * Checkout's return URLs carry a signed pass (/api/onboarding/handoff), so
 * the buyer lands signed in on the password + download steps.
 *
 * PaywallTrustLine — one line under the main button.
 */
import { useEffect, useState } from "react";

import { detectBrowserEnv } from "@/components/app-store-cta";

type Os = "ios" | "android" | null;

function inAppOs(): Os {
  const env = detectBrowserEnv();
  if (!env.isWebView) return null;
  if (/iPhone|iPad|iPod/i.test(env.ua)) return "ios";
  if (/Android/i.test(env.ua)) return "android";
  return null;
}

export function PayInBrowserButton({
  interval,
  funnel,
  track,
  className,
}: {
  interval: "monthly" | "yearly";
  funnel: string;
  track: (event: string, value?: string) => void;
  className?: string;
}) {
  const [os, setOs] = useState<Os>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const o = inAppOs();
    setOs(o);
    if (o) track("funnel_pay_in_browser_shown", o);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!os) return null;

  const go = async () => {
    setBusy(true);
    setErr(null);
    track("funnel_pay_in_browser_tapped", `${os}|${interval}`);
    try {
      const res = await fetch("/api/onboarding/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval, funnel, handoff: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't open checkout");
      const url = data.url;
      if (os === "ios") {
        window.location.href = `x-safari-${url}`;
        // Older iOS ignores x-safari-: open the hosted checkout right here.
        window.setTimeout(() => {
          if (document.visibilityState === "visible") window.location.href = url;
        }, 1500);
      } else {
        const bare = url.replace(/^https:\/\//, "");
        window.location.href = `intent://${bare}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't open checkout");
      track("funnel_pay_in_browser_failed", String(e).slice(0, 80));
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-acuity-line-strong bg-black py-3.5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? "Opening…" : os === "ios" ? (
          <>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
              <path d="M16.37 12.64c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.3-.88-2.32-3.55zM14.2 6.17c.61-.74 1.02-1.76.91-2.78-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.69-.93 2.69.98.08 1.98-.5 2.59-1.23z" />
            </svg>
            Pay with Apple Pay in Safari
          </>
        ) : (
          "Pay with Google Pay in Chrome"
        )}
      </button>
      <p className="mt-1.5 text-center text-[12px] text-acuity-text-ter">Faster checkout in your phone&rsquo;s browser. Same free week.</p>
      {err && <p className="mt-1.5 text-center text-[12px] text-acuity-bad">{err}</p>}
    </div>
  );
}

export function PaywallTrustLine({ className }: { className?: string }) {
  return (
    <p className={`text-center text-[12.5px] font-medium text-acuity-text-sec ${className ?? ""}`}>
      Cancel anytime in 2 taps &middot; we remind you on day 4
    </p>
  );
}
