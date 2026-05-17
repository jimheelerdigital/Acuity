import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import Script from "next/script";
import "./globals.css";

import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { NavBar } from "@/components/nav-bar";
import { GoogleAnalytics } from "@/components/google-analytics";
import { CookieConsentBanner } from "@/components/cookie-consent";
import { ConsentGatedTrackers } from "@/components/consent-gated-trackers";
import { CrisisFooter } from "@/components/crisis-footer";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
// FoundingMemberBanner is embedded directly in landing.tsx and landing-shared.tsx
// (above their own fixed navs) rather than in the root layout.

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Acuity — One Minute a Day. A Life of Clarity.",
    template: "%s | Acuity",
  },
  description:
    "The AI journal that listens. Record your daily debrief by voice — AI extracts tasks, tracks goals, detects life patterns, and delivers your weekly report. No typing. No prompts. Just talk.",
  metadataBase: new URL("https://getacuity.io"),
  alternates: {
    canonical: "https://getacuity.io",
  },
  openGraph: {
    type: "website",
    url: "https://getacuity.io",
    siteName: "Acuity",
    title: "Acuity — One Minute a Day. A Life of Clarity.",
    description:
      "The AI journal that listens. Record your daily debrief by voice — AI extracts tasks, tracks goals, detects life patterns, and delivers your weekly report. No typing. No prompts. Just talk.",
    images: [{ url: "/og-image.png?v=3", width: 1200, height: 630, alt: "Acuity — AI voice journal for your daily debrief" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Acuity — One Minute a Day. A Life of Clarity.",
    description:
      "The AI journal that listens. Record your daily debrief by voice — AI extracts tasks, tracks goals, detects life patterns, and delivers your weekly report.",
    images: ["/og-image.png?v=3"],
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    "theme-color": "#7C5CFC",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const structuredDataJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Acuity",
        url: "https://getacuity.io",
        logo: "https://getacuity.io/AcuityLogo.png",
        description:
          "The AI voice journal that turns your daily debrief into action. Task extraction, goal tracking, pattern detection, and weekly reports — all from a 60-second voice recording.",
        email: "hello@getacuity.io",
        // sameAs: Keenan to provide social profile URLs (Twitter/X, LinkedIn, Instagram)
        sameAs: [],
      },
      {
        "@type": "WebSite",
        name: "Acuity",
        url: "https://getacuity.io",
        potentialAction: {
          "@type": "SearchAction",
          target: "https://getacuity.io/blog?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredDataJsonLd) }}
        />
        <meta name="apple-itunes-app" content="app-id=6762633410" />
        {GOOGLE_SITE_VERIFICATION && (
          <meta name="google-site-verification" content={GOOGLE_SITE_VERIFICATION} />
        )}
        <noscript>
          <img height="1" width="1" style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=869829585445303&ev=PageView&noscript=1"
          />
        </noscript>
        <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="bg-[#FAFAF7] text-zinc-900 antialiased dark:bg-[#181614] dark:text-zinc-50">
        {/* Meta Pixel — must be in <body> for next/script afterInteractive to execute */}
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
            fbq('init', '869829585445303');
            console.log('[meta-pixel] Initialized pixel 869829585445303');
            fbq('track', 'PageView');
            console.log('[meta-pixel] Firing PageView');
          `}
        </Script>
        <Providers>
          <ConsentGatedTrackers />
          <GoogleAnalytics />
          <NavBar />
          <KeyboardShortcuts />
          <AppShell>{children}</AppShell>
          <CrisisFooter />
          <CookieConsentBanner />
        </Providers>
      </body>
    </html>
  );
}
