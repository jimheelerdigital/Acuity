import { resolveRcFlags, type RcFlagKey, type RcFlags } from "@acuity/shared";

/**
 * Mobile adapter for the RC migration flags.
 *
 * ⚠️ STATIC PROPERTY READS ARE MANDATORY HERE.
 *
 * Metro inlines `EXPO_PUBLIC_*` env vars at bundle time, but ONLY for static
 * member access (`process.env.EXPO_PUBLIC_RC_OBSERVER`). A dynamic read —
 * `process.env[key]`, which is what the shared `resolveRcFlags` reader would
 * naturally do — is NOT inlined and evaluates to `undefined` in a release
 * bundle. That would silently pin every flag off with no way to turn one on,
 * and the bug would only appear in a production build, never in dev.
 *
 * Hence the explicit RAW map below: three static reads, then the shared
 * parser applies the same fail-closed rules the server uses.
 *
 * Set these as EAS Secrets / eas.json `env` per profile. Absent = off.
 */
const RAW: Record<RcFlagKey, string | undefined> = {
  RC_OBSERVER: process.env.EXPO_PUBLIC_RC_OBSERVER,
  RC_SOURCE_OF_TRUTH: process.env.EXPO_PUBLIC_RC_SOURCE_OF_TRUTH,
  RC_SDK_PURCHASES: process.env.EXPO_PUBLIC_RC_SDK_PURCHASES,
};

export function rcFlags(): RcFlags {
  return resolveRcFlags((key) => RAW[key]);
}

export function isRcFlagOn(key: RcFlagKey): boolean {
  return rcFlags()[key];
}

/**
 * Platform-specific RevenueCat PUBLIC SDK keys.
 *
 * These are publishable (they ship inside the app binary and are safe to
 * expose) — distinct from RC_SECRET_KEY, which is server-only and must never
 * appear in the mobile bundle. Both are absent today; `configureRevenueCat`
 * no-ops without them.
 */
const KEYS = {
  ios: process.env.EXPO_PUBLIC_RC_IOS_KEY,
  android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY,
};

export function rcApiKeyFor(platform: "ios" | "android"): string | null {
  const raw = platform === "ios" ? KEYS.ios : KEYS.android;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}
