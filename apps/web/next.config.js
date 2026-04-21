/** @type {import('next').NextConfig} */

/**
 * Content-Security-Policy allowlist.
 *
 * Kept explicit — enumerating every legitimate origin rather than
 * relying on wildcards means any new third-party integration has to
 * make a conscious config addition. Sources of each entry:
 *
 *   Google Analytics + Tag Manager ........ https://www.googletagmanager.com
 *                                            https://www.google-analytics.com
 *   Meta Pixel ............................ https://connect.facebook.net
 *                                            https://www.facebook.com
 *   Contentsquare / Hotjar ................ https://t.contentsquare.net
 *                                            https://*.hotjar.com
 *                                            https://*.hotjar.io
 *   PostHog ............................... https://us.i.posthog.com
 *                                            https://*.posthog.com
 *   Google Fonts .......................... https://fonts.googleapis.com
 *                                            https://fonts.gstatic.com
 *   Stripe Checkout ....................... https://js.stripe.com
 *                                            https://checkout.stripe.com
 *                                            https://*.stripe.com
 *   JSON-LD structured-data scripts ....... 'unsafe-inline' on script-src
 *                                            (hashed alternative deferred)
 *   Meta Pixel tracker init + GTM inline .. 'unsafe-inline' on script-src
 *
 * 'unsafe-inline' on script-src is a real loosening. Tightening
 * requires hashing every inline <Script> tag we render. That's a
 * migration; tracked as a follow-up in docs/SECURITY_AUDIT.md.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Scripts
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://www.facebook.com https://t.contentsquare.net https://*.hotjar.com https://*.hotjar.io https://us.i.posthog.com https://*.posthog.com https://js.stripe.com https://checkout.stripe.com",
  "script-src-elem 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://www.facebook.com https://t.contentsquare.net https://*.hotjar.com https://*.hotjar.io https://us.i.posthog.com https://*.posthog.com https://js.stripe.com https://checkout.stripe.com",
  // Styles
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Fonts
  "font-src 'self' data: https://fonts.gstatic.com",
  // Images + media
  "img-src 'self' data: blob: https: https://*.googleusercontent.com https://www.facebook.com https://*.google-analytics.com",
  "media-src 'self' blob:",
  // Connections — APIs called from the browser
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com https://*.hotjar.com https://*.hotjar.io https://www.google-analytics.com https://api.stripe.com https://checkout.stripe.com https://r.stripe.com https://*.stripe.com https://www.facebook.com https://connect.facebook.net https://t.contentsquare.net https://oauth2.googleapis.com https://*.sentry.io https://*.ingest.sentry.io",
  // Frames (Stripe Checkout embeds an iframe)
  "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://*.stripe.com https://www.facebook.com",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com",
  "base-uri 'self'",
  "object-src 'none'",
  "manifest-src 'self'",
  // Upgrade any accidental http:// links on an https:// page to https://
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    // Content-Security-Policy — primary XSS/injection defense.
    key: "Content-Security-Policy",
    value: CSP_DIRECTIVES,
  },
  {
    // Strict-Transport-Security — 1 year + preload eligible. After
    // this deploy has been live for a week without rollback, submit
    // getacuity.io to hstspreload.org.
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  {
    // DENY framing entirely — belt + suspenders with the CSP
    // frame-ancestors directive (older browsers honor this).
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Prevent MIME-sniff-based XSS.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Strict referrer on cross-origin nav; same-origin keeps it.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Lock down powerful browser APIs we don't use. Microphone +
    // camera left on because the PWA-style recording UI needs them.
    // Same-origin scope only.
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(), geolocation=(), interest-cohort=(), payment=(self)",
  },
];

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Wrap with Sentry when SENTRY_ORG + SENTRY_PROJECT are configured.
// Without them, `withSentryConfig` would fail during build on uploading
// source maps. Gate so local + preview builds without Sentry env don't
// break. Required env vars documented in docs/ERROR_MONITORING.md.
const { SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN } = process.env;
if (SENTRY_ORG && SENTRY_PROJECT && SENTRY_AUTH_TOKEN) {
  const { withSentryConfig } = require("@sentry/nextjs");
  module.exports = withSentryConfig(nextConfig, {
    org: SENTRY_ORG,
    project: SENTRY_PROJECT,
    authToken: SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    widenClientFileUpload: true,
    tunnelRoute: "/monitoring",
    disableLogger: true,
    automaticVercelMonitors: false,
  });
} else {
  module.exports = nextConfig;
}
