import * as Tracking from "expo-tracking-transparency";
import { Platform } from "react-native";
import {
  AppEventsLogger,
  Settings,
} from "react-native-fbsdk-next";

import {
  enableAppleSearchAdsAttribution,
  linkRevenueCatAdIdentifiers,
} from "@/lib/revenuecat";

/**
 * Meta SDK (Facebook App Events) integration for mobile ad
 * attribution. 2026-05-25 — Keenan-requested install.
 *
 * Why this exists: the web side already has Meta Pixel firing
 * StartTrial / Subscribe / CompletedRegistration events. The
 * mobile binary needs the SAME funnel events firing through the
 * native Facebook App Events SDK so Meta can stitch ad clicks
 * back to in-app conversions on iOS (where the web pixel can't
 * follow the user across the App Store handoff).
 *
 * App.json's `react-native-fbsdk-next` config:
 *   - isAutoInitEnabled: false — we control init timing manually
 *     so the SDK starts AFTER the ATT prompt has been answered
 *     (iOS 14.5+). Auto-init would start collecting IDFA before
 *     the user consented, which violates Apple policy.
 *   - autoLogAppEventsEnabled: true — App Install + App Open
 *     fire automatically once we init.
 *   - advertiserIDCollectionEnabled: false (at config time);
 *     flipped to true at runtime ONLY when ATT is granted.
 *
 * iOS ATT requirement: NSUserTrackingUsageDescription is set in
 * app.json via the expo-tracking-transparency plugin. The user
 * must approve before we can collect IDFA. If they deny, the
 * SDK still works for basic conversion events (App Install /
 * App Open / our manual events) but without IDFA matching, the
 * attribution quality degrades to SKAdNetwork-only.
 *
 * Android: no ATT equivalent. SDK initializes immediately on
 * first call to initMetaSdk on Android.
 *
 * Manual events fired from elsewhere:
 *   - onboarding_recording_completed → in slice 6 of onboarding-v2
 *     (the in-app recording screen)
 *   - CompletedRegistration → in slice 8 of onboarding-v2 (signup
 *     success path) + the existing (auth)/sign-in.tsx flow
 *   - StartTrial → wherever subscriptionStatus first flips to TRIAL
 *     (currently bootstrap-user on the web side; mobile fires from
 *     the post-signup landing once status syncs back via /api/user/me)
 *   - Subscribe → in apps/mobile/lib/iap.ts after a successful
 *     purchase callback
 */

let sdkInitialized = false;
let attStatus: "unrequested" | "granted" | "denied" | "unknown" =
  "unrequested";

/**
 * Resolve the ATT prompt (iOS only) and initialize the FB SDK
 * with the resulting tracking preference. Idempotent — safe to
 * call multiple times; only the first call does work.
 *
 * Call this from `_layout.tsx` after AuthGate resolves, NOT on
 * cold launch root render. Apple's review guidance is that the
 * ATT prompt should appear "when the user has context for why
 * tracking is being requested" — calling it during the first
 * authenticated app render satisfies that better than firing it
 * at splash time before any UI has loaded.
 */
// Events logged before the SDK is initialized (initMetaSdk waits on the ATT
// prompt, and sign-up fires its registration event right away) are queued
// and flushed once it's ready, instead of being dropped.
const pending: Array<() => void> = [];
function logOrQueue(fn: () => void): void {
  if (sdkInitialized) {
    try {
      fn();
    } catch {
      /* analytics only */
    }
  } else if (pending.length < 20) {
    pending.push(fn);
  }
}
function flushPending(): void {
  for (const fn of pending.splice(0)) {
    try {
      fn();
    } catch {
      /* analytics only */
    }
  }
}

/**
 * 2026-10-21 (before app-install ads): START the SDK on every launch,
 * separately from ASKING for tracking.
 *
 * initMetaSdk used to do both, and _layout only called it once onboarding
 * was finished (so the ATT pop-up couldn't interrupt the first recording).
 * The side effect: a new install that quit before the paywall never sent
 * Meta an install / fb_mobile_activate_app at all, and finishers only sent
 * it at the end of onboarding. App-install campaigns optimise on exactly
 * those events.
 *
 * Now:
 *   - startMetaSdk(): first thing at launch. Reads the CURRENT ATT status
 *     without prompting; tracking flags stay OFF unless the user already
 *     granted it. Meta's auto-logged install + activate events go out with
 *     the limited (no-IDFA) signal, which Apple permits without consent.
 *   - requestMetaTracking(): unchanged timing (after onboarding). Shows the
 *     ATT prompt once and switches the flags on if granted.
 */
async function applyTrackingFlags(status: string): Promise<void> {
  if (status === "granted") attStatus = "granted";
  else if (status === "denied" || status === "restricted") attStatus = "denied";
  else attStatus = status === "undetermined" ? "unrequested" : "unknown";
  const granted = attStatus === "granted";
  Settings.setAdvertiserTrackingEnabled(granted);
  // Two independent flags in the SDK; both follow the user's choice.
  Settings.setAdvertiserIDCollectionEnabled(granted);
}

function linkAdIdentifiers(): void {
  // RevenueCat → Meta (Conversions API) matching needs the Meta anonymous
  // id + device identifiers. Re-run after the ATT answer so a granted
  // user's IDFA reaches RevenueCat. Fire-and-forget.
  void AppEventsLogger.getAnonymousID()
    .then((anonId) => linkRevenueCatAdIdentifiers(anonId))
    .catch(() => {});
  // Apple Search Ads → RevenueCat (AdServices token; no ATT needed).
  // Idempotent inside.
  void enableAppleSearchAdsAttribution().catch(() => {});
}

export async function startMetaSdk(): Promise<void> {
  if (sdkInitialized) return;
  try {
    if (Platform.OS === "ios") {
      // Read only — never prompts.
      const { status } = await Tracking.getTrackingPermissionsAsync();
      await applyTrackingFlags(status);
    }
    // Auto-logged install / fb_mobile_activate_app fire on init
    // (autoLogAppEventsEnabled in app.config).
    Settings.initializeSDK();
    sdkInitialized = true;
    flushPending();
    linkAdIdentifiers();
  } catch (err) {
    // Non-fatal: lose attribution rather than crash.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[meta-sdk] start failed:", err);
    }
  }
}

let trackingRequested = false;

/** Ask for ATT (iOS) once, after onboarding, and apply the answer. */
export async function requestMetaTracking(): Promise<void> {
  if (trackingRequested) return;
  trackingRequested = true;
  try {
    await startMetaSdk();
    if (Platform.OS === "ios") {
      // No system prompt if the user already decided.
      const { status } = await Tracking.requestTrackingPermissionsAsync();
      await applyTrackingFlags(status);
    }
    linkAdIdentifiers();
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[meta-sdk] tracking request failed:", err);
    }
  }
}

/** @deprecated kept for older call sites: start + ask. */
export async function initMetaSdk(): Promise<void> {
  await requestMetaTracking();
}

/**
 * Set the authenticated user id on the SDK. Meta uses this for
 * cross-session attribution. Call from auth-context.refresh after
 * a sign-in succeeds and again on cold-launch when a session is
 * already present. Pass null on sign-out to clear.
 */
export function setMetaUserId(userId: string | null): void {
  try {
    if (userId) {
      AppEventsLogger.setUserID(userId);
    } else {
      AppEventsLogger.clearUserID();
    }
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[meta-sdk] setUserID failed:", err);
    }
  }
}

// ─── Manual event helpers ───────────────────────────────────────────
// Each helper is a thin wrapper so call sites stay readable + we have
// one place to add safety guards (e.g. swallowing errors, logging in
// dev). Event names match Meta's standard event vocabulary where
// possible — "CompletedRegistration", "StartTrial", "Subscribe" are
// recognized as conversion events in Meta Ads Manager out of the box.
// "onboarding_recording_completed" is custom (no Meta-standard match
// for "user completed first recording in a journaling app").

/**
 * Fire when the user finishes their first recording inside the
 * onboarding flow. Call from slice 6 of onboarding-v2 (recording
 * screen) right after the upload to /api/mobile/try-recording
 * succeeds.
 */
export function logRecordingCompleted(): void {
  try {
    AppEventsLogger.logEvent("onboarding_recording_completed");
  } catch {
    // Swallow — attribution loss is preferable to a crash.
  }
}

/**
 * Fire when a new account is created (any auth method). Call from
 * slice 8 of onboarding-v2 (signup success path) and from the
 * existing /(auth)/sign-up.tsx flow.
 */
export function logCompletedRegistration(method: "apple" | "google" | "email"): void {
  try {
    logOrQueue(() =>
      AppEventsLogger.logEvent("fb_mobile_complete_registration", {
        fb_registration_method: method,
      })
    );
  } catch {
    // ignore
  }
}

/**
 * Fire when the user's trial begins (subscriptionStatus transitions
 * to TRIAL). The optional value/currency lets Meta model trial-to-
 * paid expected value for bid optimization.
 */
export function logStartTrial(
  value?: number,
  currency: string = "USD"
): void {
  try {
    if (typeof value === "number" && Number.isFinite(value)) {
      AppEventsLogger.logEvent("fb_mobile_start_trial", value, {
        fb_currency: currency,
      });
    } else {
      AppEventsLogger.logEvent("fb_mobile_start_trial");
    }
  } catch {
    // ignore
  }
}

/**
 * Fire when a subscription purchase completes. Used for both the
 * Stripe handoff path (web returns to mobile after checkout — fire
 * from the /upgrade?success=true return URL handler if mobile
 * intercepts) and the in-app IAP path (apps/mobile/lib/iap.ts
 * purchase listener). Both code paths converge on the same Meta
 * event so dedup happens on Meta's side via event-id tagging
 * (future hardening — out of scope for first install).
 */
export function logSubscribe(value: number, currency: string = "USD"): void {
  try {
    AppEventsLogger.logPurchase(value, currency, {
      fb_content_type: "subscription",
    });
  } catch {
    // ignore
  }
}

export function getAttStatus():
  | "unrequested"
  | "granted"
  | "denied"
  | "unknown" {
  return attStatus;
}
