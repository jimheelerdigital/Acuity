/**
 * Sentry — Edge runtime (middleware + edge API routes). Same PII-scrub
 * posture as the Node.js server config — middleware exceptions can
 * surface plaintext emails, session cookies, and authorization headers,
 * none of which should ever reach the Sentry dashboard.
 *
 * Keep this file's scrubber in sync with sentry.server.config.ts. They
 * intentionally duplicate the patterns rather than importing a shared
 * helper because both files are evaluated at SDK init time, before the
 * Next.js module graph is wired up — `import "@/lib/..."` is unsafe in
 * a Sentry config.
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENV = process.env.NODE_ENV ?? "development";

const PII_KEY_PATTERNS: RegExp[] = [
  /^email$/i,
  /^transcript$/i,
  /^summary$/i,
  /^content$/i,
  /^entry$/i,
  /^rawanalysis$/i,
  /^passwordhash$/i,
  /^password$/i,
  /^token$/i,
  /^sessiontoken$/i,
  /^authorization$/i, // bearer tokens in request headers
  /^cookie$/i,
];

function scrubDeep<T>(value: T, depth = 0): T {
  if (depth > 6) return "[TRUNCATED]" as unknown as T;
  if (value == null) return value;
  if (Array.isArray(value))
    return value.map((v) => scrubDeep(v, depth + 1)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEY_PATTERNS.some((re) => re.test(k))) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = scrubDeep(v, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
}

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENV,
    enabled: ENV === "production" || ENV === "development",
    tracesSampleRate: ENV === "production" ? 0.01 : 0.1,
    beforeSend(event) {
      return scrubDeep(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubDeep(breadcrumb);
    },
  });
}
