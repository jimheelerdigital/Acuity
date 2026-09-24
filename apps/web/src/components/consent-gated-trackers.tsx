"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import { effectiveConsent, readConsent } from "@/components/cookie-consent";

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
 * What loads when (2026-09-24, no first-visit banner):
 *   - GA4: when effectiveConsent().analytics.
 *   - Session recording (Contentsquare): only on an explicit saved opt-in.
 *   - Meta Pixel: when effectiveConsent().marketing.
 * effectiveConsent() = the visitor's explicit choice if they made one,
 * else ON for US/most visitors and OFF for Europe/UK time zones or a
 * Global Privacy Control signal. So US ad traffic gets the pixel on the
 * first page view of /start and /start-bwk. See cookie-consent.tsx.
 *
 * Consent state is read on mount and on every
 * `acuity:consent-changed` event (fired by cookie-consent.tsx after
 * the user saves preferences).
 */

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const META_PIXEL_ID = "869829585445303";

export function ConsentGatedTrackers() {
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const sync = () => {
      const c = effectiveConsent();
      setAnalytics(c.analytics);
      setMarketing(c.marketing);
      setRecording(readConsent()?.analytics === true);
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

      {/* Meta Pixel — gated on effectiveConsent().marketing: on by
          default outside Europe/UK unless GPC is sent or the visitor
          turned it off. CAPI server-side events still fire via the API
          route (with fbp/fbc from cookies if available). */}
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

      {/* Session recording (Contentsquare) — EXPLICIT opt-in only, never
          the default. It records screens, and logged-in pages show debrief
          transcripts, so it must not switch on for everyone just because
          the analytics default is on (2026-09-24, banner removal). Loads
          only when a visitor has saved analytics = on in Cookie settings. */}
      {recording && (
        <Script
          src="https://t.contentsquare.net/uxa/b1a44cfc8f53e.js"
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
