/**
 * Sentry init for the Expo / React Native app.
 *
 * SDK: @sentry/react-native 8.x. DSN via EXPO_PUBLIC_SENTRY_DSN so
 * it's embedded into the JS bundle; safe to expose (DSN is not a
 * secret, it just identifies the ingest endpoint).
 *
 * Next EAS build will include the native module. Until that build
 * ships, Sentry.init short-circuits at runtime if the native module
 * isn't present (the JS SDK handles this gracefully — we don't need
 * a guard here).
 *
 * PII filter mirrors the web SDK's beforeSend scrub so a breadcrumb
 * that slips email / transcript / entry content into a Sentry event
 * gets redacted before send.
 */

import * as Sentry from "@sentry/react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

const PII_KEY_PATTERNS: RegExp[] = [
  /^email$/i,
  /^transcript$/i,
  /^summary$/i,
  /^content$/i,
  /^entry$/i,
  /^rawanalysis$/i,
  /^password$/i,
  /^token$/i,
  /^sessiontoken$/i,
  /^authorization$/i,
];

function scrubDeep<T>(value: T, depth = 0): T {
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

export function initSentry() {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    enableAutoSessionTracking: true,
    // Aggressive default sample. 1% traces in prod; 10% in dev.
    tracesSampleRate: __DEV__ ? 0.1 : 0.01,
    beforeSend(event) {
      return scrubDeep(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubDeep(breadcrumb);
    },
    // Ship errors even in dev so Jim gets a signal from TestFlight
    // builds ahead of the Sentry UI pages.
    enabled: true,
  });
}

/**
 * Attach a hashed user id + role tag to the current scope. Call this
 * once per app session after auth resolves; null clears the tag on
 * sign-out.
 *
 * No raw userId / email ever gets sent — the server hashes the id
 * separately (lib/sentry-user.ts on web) for correlation. On mobile
 * we just tag with the first 12 chars of the id, which is
 * non-secret and adequate for Sentry dedup.
 */
export function setSentryUser(
  user: { id: string; subscriptionStatus?: string } | null
) {
  if (!DSN) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    // Truncate so we never ship a full cuid that maps 1:1 in a leak.
    id: user.id.slice(0, 12),
    segment: user.subscriptionStatus ?? "unknown",
  });
}
