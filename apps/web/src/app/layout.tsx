import type { Metadata } from "next";
import Script from "next/script";
import { Manrope } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "@/lib/theme/tokens.css";
import "./globals.css";

import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { NavBar } from "@/components/nav-bar";
import { CelebrationMount } from "@/components/achievements/celebration-mount";
import { GoogleAnalytics } from "@/components/google-analytics";
import { CookieConsentBanner } from "@/components/cookie-consent";
import { ConsentGatedTrackers } from "@/components/consent-gated-trackers";
import { CrisisFooter } from "@/components/crisis-footer";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { MetaPixelAdvancedMatching } from "@/components/meta-pixel-events";
import { InstallBanner } from "@/components/install-banner";
import { PRODUCT_CATEGORY } from "@/lib/positioning";
import { OG_IMAGE } from "@/lib/seo";
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

// Link previews (2026-10-14, per Keenan after an Instagram DM preview showed
// the old Acuity image and "One Minute a Day"): positioning from
// lib/positioning.ts, no recording-duration claim, new og-image.png.
// No site-wide canonical or og:url (2026-10-21): pages declare their own,
// otherwise every page without one pointed at the homepage.
const DEFAULT_DESCRIPTION = `Ripple is ${PRODUCT_CATEGORY}. Try it free for 7 days.`;

export const metadata: Metadata = {
  title: {
    default: "Ripple — Change Your Life for the Better",
    template: "%s | Ripple",
  },
  description: DEFAULT_DESCRIPTION,
  metadataBase: new URL("https://goripple.io"),
  openGraph: {
    type: "website",
    siteName: "Ripple",
    title: "Ripple — Change Your Life for the Better",
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ripple — Change Your Life for the Better",
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    "theme-color": "#F2895E",
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
} = { preference: "light", palette: "coral", resolved: "light" };

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
        name: "Ripple",
        url: "https://goripple.io",
        logo: "https://goripple.io/icon-512.png",
        description: `Ripple is ${PRODUCT_CATEGORY}.`,
        email: "hello@goripple.io",
        // Ties the brand "Ripple" to our app listings, not other Ripples.
        sameAs: [
          "https://apps.apple.com/app/id6762633410",
          "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity",
        ],
      },
      {
        "@type": "WebSite",
        name: "Ripple",
        url: "https://goripple.io",
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
          id="ripple-org-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredDataJsonLd) }}
        />
        {/* Legendary Mythicals (2026-10-01) is served by this app on its own
            domain. Drop Ripple's Organization JSON-LD there, client-side, so
            the root layout stays static (no headers() read). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(/legendarymythicals\\.com$/.test(location.hostname)||location.pathname.indexOf("/lm")===0){var e=document.getElementById("ripple-org-jsonld");if(e)e.remove()}}catch(e){}})()`,
          }}
        />
        {/* App-install promotion is a body component now (<InstallBanner />,
            components/install-banner.tsx) — replaced the apple-itunes-app
            Smart Banner meta tag with a tracked, cross-platform banner. */}
        {GOOGLE_SITE_VERIFICATION && (
          <meta name="google-site-verification" content={GOOGLE_SITE_VERIFICATION} />
        )}
        {/* Meta Pixel — moved to consent-gated-trackers.tsx in v1.4
            (2026-06-03) Phase 1 international launch. The Pixel now
            loads only after the user grants marketing consent on the
            cookie banner. The <noscript> tracking image is also
            removed: without JS the consent banner can't appear, so
            firing the Pixel anyway would defeat the consent gate. */}
        <link rel="icon" type="image/png" href="/favicon-96x96.png?v=3" sizes="96x96" />
        <link rel="shortcut icon" href="/favicon.ico?v=3" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=3" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="bg-acuity-bg text-acuity-text antialiased">
        {/* Meta Pixel + GA4 are mounted by ConsentGatedTrackers below,
            inside <Providers>. Loads only after the user grants
            cookie consent on the banner. Centralised there so both
            trackers obey the same consent record. */}
        <Providers
          initialThemePreference={appearance.preference}
          initialPalette={appearance.palette}
          initialResolvedTheme={appearance.resolved}
        >
          <MetaPixelAdvancedMatching />
          <ConsentGatedTrackers />
          <GoogleAnalytics />
          <NavBar />
          <KeyboardShortcuts />
          <AppShell>{children}</AppShell>
          {/* v1.3 achievements — polls /api/achievements/pending on
              mount + window focus; renders the celebration modal over
              the current page when there's an unseen UserAchievement.
              Self-gates on next-auth session (renders null when
              unauthenticated) so anonymous landing pages don't poll. */}
          <CelebrationMount />
          <CrisisFooter />
          <CookieConsentBanner />
          {/* Cross-platform install banner (App Store / Play Store). Replaces
              Apple's native Smart App Banner for iOS + Android reach +
              click/impression tracking. Self-gates by route + platform. */}
          <InstallBanner />
        </Providers>
      </body>
    </html>
  );
}
