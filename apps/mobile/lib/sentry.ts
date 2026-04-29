/**
 * Sentry init for the Expo / React Native app.
 *
 * SDK: @sentry/react-native 7.x (pinned to Expo SDK 54's expected
 * range; v8 ships with Expo SDK 55+). DSN via EXPO_PUBLIC_SENTRY_DSN so
 * it's embedded into the JS bundle; safe to expose (DSN is not a
 * secret, it just identifies the ingest endpoint).
 *
 * Native module is autolinked via the @sentry/react-native/expo
 * config plugin registered in app.json.
 *
 * PII filter mirrors the web SDK's beforeSend scrub so a breadcrumb
 * that slips email / transcript / entry content into a Sentry event
 * gets redacted before send.
 */

import Constants from "expo-constants";
import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Version tagging. `release` groups events across a given JS bundle;
// `dist` disambiguates native builds of the same release. Matching
// the format EAS/Expo Updates uses so future OTA events align.
const APP_VERSION =
  (Constants.expoConfig?.version as string | undefined) ?? "0.0.0";
const NATIVE_BUILD =
  (Constants.expoConfig?.ios?.buildNumber as string | undefined) ??
  (Constants.expoConfig?.android?.versionCode as number | undefined)?.toString() ??
  "dev";
const RELEASE = `com.heelerdigital.acuity@${APP_VERSION}`;
const DIST = `${Platform.OS}-${NATIVE_BUILD}`;
const ENVIRONMENT = __DEV__ ? "development" : "production";

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
  if (!DSN) {
    // Loud in dev so the next cofounder who adds a new env/profile
    // notices immediately. Silent in prod (nothing to report to).
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        "[sentry] EXPO_PUBLIC_SENTRY_DSN not set — Sentry disabled. " +
          "Check apps/mobile/eas.json env block for the active build profile."
      );
    }
    return;
  }
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    dist: DIST,
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

  // One-shot launch canary. Confirms DSN + network + ingest on the
  // very first open of a fresh install; if this event shows up in
  // Sentry, the pipeline works and any silent crash after this point
  // is a real bug to chase. Kept as info-level so it's trivially
  // filterable (`level:info`) in the issue list.
  Sentry.captureMessage(`mobile.launch ${RELEASE} ${DIST}`, "info");
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
