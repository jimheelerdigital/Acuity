"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import { readConsent } from "@/components/cookie-consent";

/**
 * Consent-gated tracking script loader.
 *
 * v1.4 (2026-06-03) rewrite — Phase 1 international launch. The
 * prior version of this component said in a docstring that GA4 +
 * Meta Pixel loaded UNCONDITIONALLY with anonymized_ip true. That
 * was non-compliant for EU/UK visitors: GA4 with IP anonymisation
 * still processes personal data under ICO + CNIL interpretations
 * and requires consent (Art. 6(1)(a) GDPR). Meta Pixel never has a
 * lawful basis short of consent for non-essential marketing
 * attribution.
 *
 * What loads when:
 *   - GA4 + session recording: ONLY after `consent.analytics === true`.
 *   - Meta Pixel: ONLY after `consent.marketing === true`.
 *
 * Consent state is read on mount and on every
 * `acuity:consent-changed` event (fired by cookie-consent.tsx after
 * the user picks an option or changes one mid-session).
 */

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const META_PIXEL_ID = "869829585445303";

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
      {/* GA4 — analytics consent gated. anonymize_ip stays on as a
          defence-in-depth measure, but the actual lawful basis is
          consent (Art. 6(1)(a) GDPR). */}
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
              gtag('config', '${GA_MEASUREMENT_ID}', {
                anonymize_ip: true,
                cookie_flags: 'SameSite=None;Secure'
              });
            `}
          </Script>
        </>
      )}

      {/* Meta Pixel — marketing consent gated (v1.5, 2026-06-13).
          Previously loaded unconditionally, which was non-compliant
          for EU/UK visitors under GDPR Art. 6(1)(a). Now loads only
          after the user grants marketing consent on the cookie banner.
          CAPI server-side events will still fire via the API route
          (with fbp/fbc from cookies if available). */}
      {marketing && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}

      {/* Session recording (Contentsquare) — analytics consent
          gated. Records user sessions, so requires consent under
          ePrivacy + UK PECR even with IP anonymisation. */}
      {analytics && (
        <Script
          src="https://t.contentsquare.net/uxa/b1a44cfc8f53e.js"
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
