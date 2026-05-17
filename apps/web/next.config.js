/** @type {import('next').NextConfig} */

/**
 * Content-Security-Policy allowlist — DO NOT remove entries without
 * verifying the service is unused. Every listed origin is load-bearing
 * for a user-facing flow; silent removals have caused auth + checkout
 * regressions before.
 *
 * Per-service directive map — which directives each third-party needs:
 *
 *   Supabase (auth, realtime, storage)
 *       connect-src  https://*.supabase.co  (REST + auth API)
 *       connect-src  wss://*.supabase.co    (realtime websocket)
 *       worker-src   blob:                  (auth SDK spawns a Web
 *                                            Worker via blob URL —
 *                                            without worker-src, it
 *                                            falls back to script-src
 *                                            which does not allow
 *                                            blob: and breaks sign-in)
 *       img-src      https: (wildcard covers *.supabase.co storage)
 *
 *   Google OAuth (sign-in)
 *       connect-src  https://accounts.google.com      (OIDC discovery)
 *       connect-src  https://oauth2.googleapis.com    (token exchange)
 *       form-action  https://accounts.google.com      (NextAuth v4
 *                                                     posts a hidden
 *                                                     form to its own
 *                                                     signin endpoint,
 *                                                     which 302-redirects
 *                                                     to accounts.google.com.
 *                                                     Chrome 105+ enforces
 *                                                     form-action on
 *                                                     redirect targets
 *                                                     per CSP Level 3,
 *                                                     so the redirect
 *                                                     target must be
 *                                                     allowlisted here
 *                                                     too — not just in
 *                                                     connect-src.)
 *
 *   Google Analytics + Tag Manager
 *       script-src   https://www.googletagmanager.com
 *                    https://www.google-analytics.com
 *       connect-src  https://www.google-analytics.com
 *       img-src      https://*.google-analytics.com
 *
 *   Meta Pixel (Facebook)
 *       script-src   https://connect.facebook.net https://*.facebook.net
 *                    https://www.facebook.com https://*.facebook.com
 *       connect-src  https://www.facebook.com https://*.facebook.com
 *                    https://connect.facebook.net https://*.facebook.net
 *                    https://*.fbcdn.net
 *       img-src      https://www.facebook.com https://*.facebook.com
 *                    https://*.fbcdn.net
 *       frame-src    https://www.facebook.com
 *
 *   Stripe Checkout
 *       script-src   https://js.stripe.com https://checkout.stripe.com
 *       connect-src  https://api.stripe.com https://checkout.stripe.com
 *                    https://r.stripe.com https://*.stripe.com
 *       frame-src    https://js.stripe.com https://checkout.stripe.com
 *                    https://*.stripe.com
 *       form-action  https://checkout.stripe.com
 *
 *   PostHog (product analytics)
 *       script-src + connect-src
 *                    https://us.i.posthog.com https://*.posthog.com
 *
 *   Hotjar (session replay)
 *       script-src + connect-src
 *                    https://*.hotjar.com https://*.hotjar.io
 *
 *   Contentsquare
 *       script-src + connect-src  https://t.contentsquare.net
 *
 *   Google Fonts
 *       style-src    https://fonts.googleapis.com
 *       font-src     https://fonts.gstatic.com
 *
 *   Sentry (error monitoring)
 *       connect-src  https://*.sentry.io https://*.ingest.sentry.io
 *
 *   Inline scripts (JSON-LD structured data, Meta Pixel init, GTM init)
 *       script-src   'unsafe-inline'  (hashed alternative tracked as
 *                                      F-15 in docs/SECURITY_AUDIT.md)
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Scripts
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://*.facebook.net https://www.facebook.com https://*.facebook.com https://t.contentsquare.net https://*.hotjar.com https://*.hotjar.io https://us.i.posthog.com https://*.posthog.com https://js.stripe.com https://checkout.stripe.com",
  "script-src-elem 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://*.facebook.net https://www.facebook.com https://*.facebook.com https://t.contentsquare.net https://*.hotjar.com https://*.hotjar.io https://us.i.posthog.com https://*.posthog.com https://js.stripe.com https://checkout.stripe.com",
  // Workers — Supabase auth SDK spawns a Web Worker from a blob URL.
  // Without this directive, worker-src falls back to script-src which
  // does not allow blob:, and sign-in silently breaks in the browser.
  "worker-src 'self' blob:",
  // Styles
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Fonts
  "font-src 'self' data: https://fonts.gstatic.com",
  // Images + media
  "img-src 'self' data: blob: https: https://*.googleusercontent.com https://www.facebook.com https://*.facebook.com https://*.fbcdn.net https://*.google-analytics.com",
  "media-src 'self' blob:",
  // Connections — APIs called from the browser
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com https://*.hotjar.com https://*.hotjar.io https://www.google-analytics.com https://api.stripe.com https://checkout.stripe.com https://r.stripe.com https://*.stripe.com https://www.facebook.com https://*.facebook.com https://connect.facebook.net https://*.facebook.net https://*.fbcdn.net https://t.contentsquare.net https://accounts.google.com https://oauth2.googleapis.com https://*.sentry.io https://*.ingest.sentry.io",
  // Frames (Stripe Checkout embeds an iframe)
  "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://*.stripe.com https://www.facebook.com",
  "frame-ancestors 'none'",
  // NextAuth v4's signIn("google") posts a hidden form to /api/auth/signin/google
  // which then 302-redirects to accounts.google.com. Chrome enforces form-action
  // on redirect targets (CSP Level 3) — so the Google OAuth origin has to be
  // allowlisted here, not just in connect-src. Checkout.stripe.com was already
  // here for the existing Stripe Checkout form POST.
  "form-action 'self' https://checkout.stripe.com https://accounts.google.com",
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
  experimental: {
    // facebook-nodejs-business-sdk is a CJS package that webpack can't resolve
    // at build time. Mark it as external so it's loaded via require() at runtime.
    serverComponentsExternalPackages: ["facebook-nodejs-business-sdk"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/blog-images/**",
      },
    ],
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
