import type { Metadata } from "next";
import Script from "next/script";
import { Manrope } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "@/lib/theme/tokens.css";
import "./globals.css";

import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { NavBar } from "@/components/nav-bar";
import { GoogleAnalytics } from "@/components/google-analytics";
import { CookieConsentBanner } from "@/components/cookie-consent";
import { ConsentGatedTrackers } from "@/components/consent-gated-trackers";
import { CrisisFooter } from "@/components/crisis-footer";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import {
  type Palette,
  type ResolvedTheme,
  type ThemePreference,
} from "@/contexts/appearance-context";
// FoundingMemberBanner is embedded directly in landing.tsx and landing-shared.tsx
// (above their own fixed navs) rather than in the root layout.

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

/**
 * Canonical font families per DESIGN_SYSTEM.md §3.1:
 *   - display: Manrope (large stats, titles, hero numbers)
 *   - sans:    system stack (-apple-system → BlinkMacSystemFont → …)
 *   - mono:    Geist Mono (numerals, timestamps, eyebrow / overline)
 *
 * `sans` doesn't need a Google Font import — the system stack lives in
 * tailwind.config.ts. Manrope ships via `next/font/google`. Geist Mono
 * isn't on Google Fonts; we load it self-hosted via the `geist` npm
 * package (`geist/font/mono`), which exposes the .woff2 files Vercel
 * publishes. Each font object exposes `.variable` — tailwind reads
 * `--font-display` (Manrope) and `--font-geist-mono` (Geist Mono).
 *
 * Slice 1 (2026-05-22): replaced Inter + Playfair Display. Existing
 * pages that use `font-sans` now inherit the system stack; pages that
 * use `font-display` now render Manrope (was Playfair serif). This is
 * intentional foundation work — `font-serif` is a legacy alias that
 * also resolves to Manrope so no consumer breaks during migration.
 */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
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

/**
 * Theme + palette defaults. The root layout no longer reads the
 * user's DB preference server-side — that was forcing the entire
 * site dynamic (headers() + getServerSession on every request).
 *
 * Instead, a blocking <script> in <head> reads the `acuity_appearance`
 * cookie (set by AppearanceProvider on theme change) and applies
 * data-theme + data-palette before first paint. Marketing pages
 * always render light+coral. Logged-in users get instant correction
 * via the cookie or AppearanceProvider hydration.
 */
const DEFAULT_APPEARANCE: {
  preference: ThemePreference;
  palette: Palette;
  resolved: ResolvedTheme;
} = { preference: "system", palette: "coral", resolved: "light" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const appearance = DEFAULT_APPEARANCE;
  const structuredDataJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Acuity",
        url: "https://getacuity.io",
        logo: "https://getacuity.io/AcuityLogo.png",
        description:
          "The AI voice journal that turns your daily debrief into action. Task extraction, goal tracking, pattern detection, and weekly reports — all from a daily voice recording.",
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
      data-theme={appearance.resolved}
      data-palette={appearance.palette}
      className={`${manrope.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Blocking theme script — reads acuity_appearance cookie and sets
            data-theme + data-palette on <html> before first paint. Prevents
            flash of wrong theme for logged-in users with non-default prefs.
            Cookie format: "theme:palette" e.g. "dark:cobalt" */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.match(/acuity_appearance=([^;]+)/);if(c){var p=c[1].split(":");if(p[0])document.documentElement.setAttribute("data-theme",p[0]);if(p[1])document.documentElement.setAttribute("data-palette",p[1])}}catch(e){}})()`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredDataJsonLd) }}
        />
        <meta name="apple-itunes-app" content="app-id=6762633410" />
        {GOOGLE_SITE_VERIFICATION && (
          <meta name="google-site-verification" content={GOOGLE_SITE_VERIFICATION} />
        )}
        {/* Meta Pixel — deferred to avoid blocking first paint.
            Previously loaded synchronously in <head>; moved to
            afterInteractive so hero content renders first. */}
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
      <body className="bg-acuity-bg text-acuity-text antialiased">
        {/* Meta Pixel — loaded after first paint, not blocking render */}
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
        <Providers
          initialThemePreference={appearance.preference}
          initialPalette={appearance.palette}
          initialResolvedTheme={appearance.resolved}
        >
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
