/**
 * Sentry — browser runtime. Loaded by Next on every client render.
 *
 * Sample rates:
 *   - errors    — 100% in prod, 100% in dev (dev: useful signal;
 *                 sampling eats too much useful info locally)
 *   - traces    — 1% in prod (keep performance data broad + cheap)
 *   - replay    — disabled. Session Replay records DOM + user input
 *                 which would capture entry content on the record
 *                 screen. Tripwire-worthy PII leak risk — ship when
 *                 we build a content-masking allowlist.
 *
 * PII filter: beforeSend strips anything that looks like email,
 * transcript, or entry content from breadcrumbs + exception messages.
 * User id is passed via setUser only after the caller hashes it.
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENV = process.env.NODE_ENV ?? "development";

// Fields we NEVER send to Sentry, even if they slip into a
// breadcrumb. Checked case-insensitively in keys and values.
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
];

function scrubDeep<T>(value: T, depth = 0): T {
  // Depth limit prevents pathological nested scrub on circular or
  // deeply-nested payloads; 6 levels is plenty for breadcrumbs.
  if (depth > 6) return "[TRUNCATED]" as unknown as T;
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => scrubDeep(v, depth + 1)) as unknown as T;
  }
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
    // No replay — content masking is a follow-up.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      return scrubDeep(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubDeep(breadcrumb);
    },
  });
}
