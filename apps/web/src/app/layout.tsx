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
    default: "Acuity — AI Journaling App | Nightly Voice Brain Dump",
    template: "%s | Acuity",
  },
  description:
    "The AI journaling app that turns a 60-second nightly voice brain dump into extracted tasks, mood tracking, mental pattern detection, and weekly AI reports.",
  metadataBase: new URL("https://getacuity.io"),
  alternates: {
    canonical: "https://getacuity.io",
  },
  openGraph: {
    type: "website",
    url: "https://getacuity.io",
    siteName: "Acuity",
    title: "Acuity — AI Journaling App | Nightly Voice Brain Dump",
    description:
      "The AI journaling app that turns a 60-second nightly voice brain dump into extracted tasks, mood tracking, mental pattern detection, and weekly AI reports.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Acuity — AI voice journaling app for nightly brain dumps" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Acuity — AI Journaling App | Nightly Voice Brain Dump",
    description:
      "Turn a 60-second nightly voice brain dump into tasks, mood tracking, pattern detection, and weekly AI reports.",
    images: ["/og-image.png"],
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
          "AI journaling app that turns a 60-second nightly voice brain dump into extracted tasks, mood tracking, mental pattern detection, and weekly AI reports.",
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
        {GOOGLE_SITE_VERIFICATION && (
          <meta name="google-site-verification" content={GOOGLE_SITE_VERIFICATION} />
        )}
        {/* Meta Pixel — fires unconditionally on every page load */}
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
            fbq('track', 'PageView');
          `}
        </Script>
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
      <body className="bg-[#FAFAF7] text-zinc-900 antialiased dark:bg-[#0B0B12] dark:text-zinc-50">
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
