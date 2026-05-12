"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import { readConsent } from "@/components/cookie-consent";

/**
 * Conditionally load tracking + analytics scripts based on the user's
 * cookie consent record. Each tracker is gated by its category:
 *
 *   analytics → Google Analytics, Hotjar/Contentsquare
 *   marketing → Meta Pixel
 *
 * (PostHog is handled by its own provider and gated on consent inside
 * PostHogProvider — see components/posthog-provider.tsx.)
 *
 * Re-reads consent on the `acuity:consent-changed` custom event so
 * a user who accepts partway through a session gets the scripts
 * loaded immediately without a page reload.
 *
 * Why this file exists:
 *   Before this, Meta Pixel + GA + Hotjar were loaded unconditionally
 *   from layout.tsx's <head>. GDPR / ePrivacy require opt-in BEFORE
 *   any non-strictly-necessary cookies drop. Moving the loaders here
 *   closes that gap.
 */

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export function ConsentGatedTrackers() {
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const sync = () => {
      const c = readConsent();
      setAnalytics(c?.analytics === true);
      setMarketing(c?.marketing === true);
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

      {marketing && META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      )}
    </>
  );
}
