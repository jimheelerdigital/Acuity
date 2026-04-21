/**
 * Sentry — Edge runtime (middleware + edge API routes). Sentry's
 * edge SDK supports a narrower surface; minimal config is enough.
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENV = process.env.NODE_ENV ?? "development";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENV,
    enabled: ENV === "production" || ENV === "development",
    tracesSampleRate: ENV === "production" ? 0.01 : 0.1,
  });
}
