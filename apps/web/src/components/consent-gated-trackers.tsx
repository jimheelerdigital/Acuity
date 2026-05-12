"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import { readConsent } from "@/components/cookie-consent";

/**
 * Conditionally load tracking + analytics scripts based on the user's
 * cookie consent record. Each tracker is gated by its category:
 *
 *   analytics → Google Analytics, Hotjar/Contentsquare
 *
 * Meta Pixel is loaded unconditionally from layout.tsx <head> — not here.
 *
 * (PostHog is handled by its own provider and gated on consent inside
 * PostHogProvider — see components/posthog-provider.tsx.)
 *
 * Re-reads consent on the `acuity:consent-changed` custom event so
 * a user who accepts partway through a session gets the scripts
 * loaded immediately without a page reload.
 */

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function ConsentGatedTrackers() {
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const sync = () => {
      const c = readConsent();
      setAnalytics(c?.analytics === true);
    };
    sync();
    window.addEventListener("acuity:consent-changed", sync);
    return () => window.removeEventListener("acuity:consent-changed", sync);
  }, []);

  return (
    <>
      {analytics && GA_MEASUREMENT_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}');
            `}
          </Script>
        </>
      )}

      {analytics && (
        <Script
          src="https://t.contentsquare.net/uxa/b1a44cfc8f53e.js"
          strategy="afterInteractive"
        />
      )}

      {/* Meta Pixel removed — now loaded unconditionally from layout.tsx */}
    </>
  );
}
