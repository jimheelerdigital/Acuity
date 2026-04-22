import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import Script from "next/script";
import "./globals.css";

import { Providers } from "@/components/providers";
import { NavBar } from "@/components/nav-bar";
import { GoogleAnalytics } from "@/components/google-analytics";
import { CookieConsentBanner } from "@/components/cookie-consent";
import { ConsentGatedTrackers } from "@/components/consent-gated-trackers";
import { CrisisFooter } from "@/components/crisis-footer";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";

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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Acuity",
    url: "https://getacuity.io",
    logo: "https://www.getacuity.io/AcuityLogo.png",
    description:
      "AI journaling app that turns a 60-second nightly voice brain dump into extracted tasks, mood tracking, mental pattern detection, and weekly AI reports.",
    sameAs: [],
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {GOOGLE_SITE_VERIFICATION && (
          <meta name="google-site-verification" content={GOOGLE_SITE_VERIFICATION} />
        )}
        {/* Third-party trackers (GA, Hotjar, Meta Pixel) are no longer
            loaded here — they're mounted by <ConsentGatedTrackers/> in
            the body below, conditional on the user's cookie consent.
            GDPR / ePrivacy compliance + SOC 2 Privacy P2. */}
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
          {children}
          <CrisisFooter />
          <CookieConsentBanner />
        </Providers>
      </body>
    </html>
  );
}
