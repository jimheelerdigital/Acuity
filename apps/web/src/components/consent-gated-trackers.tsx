"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import { readConsent } from "@/components/cookie-consent";

/**
 * Load tracking scripts. GA4 loads unconditionally (with anonymized IP)
 * for funnel visibility on paid traffic. Session-recording tools
 * (Hotjar/Contentsquare) remain consent-gated.
 *
 * Meta Pixel is loaded via next/script in layout.tsx (afterInteractive).
 *
 * (PostHog is handled by its own provider and gated on consent inside
 * PostHogProvider — see components/posthog-provider.tsx.)
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
      {/* GA4 — loaded unconditionally for paid traffic funnel visibility.
          anonymize_ip: true ensures no PII is collected without consent.
          This matches Meta Pixel's unconditional loading pattern. */}
      {GA_MEASUREMENT_ID && (
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
              gtag('config', '${GA_MEASUREMENT_ID}', {
                anonymize_ip: true,
                cookie_flags: 'SameSite=None;Secure'
              });
            `}
          </Script>
        </>
      )}

      {/* Session recording — stays behind consent (records user sessions) */}
      {analytics && (
        <Script
          src="https://t.contentsquare.net/uxa/b1a44cfc8f53e.js"
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
