import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

/**
 * Mobile-side version-check client. Mirrors the
 * `apps/web/src/lib/app-version-config.ts → AppVersionConfig` shape.
 *
 * Wired into the root layout on mount: a single async call returns
 * a `shouldShow` flag plus the config payload that the
 * `<UpdatePromptModal>` consumes. Network failure is silent — we
 * never block app launch on a remote check.
 *
 * Storage keys:
 *
 *   - `update-prompt-dismissed-version` (AsyncStorage): the
 *     `recommendedVersion` the user last dismissed. We only re-prompt
 *     when the server's `recommendedVersion` advances past this
 *     value. A no-op "Later" tap shouldn't surface the same modal on
 *     every launch.
 *
 * Versioning: a tiny inline semver comparator. We don't pull in
 * `semver` (38 KB minified) for what's effectively a 12-line dotted
 * triple compare. Handles the canonical `MAJOR.MINOR.PATCH` shape;
 * pre-release tags (e.g., "1.2.0-rc.1") are tolerated by stripping
 * the suffix before compare — TestFlight builds report the same
 * `Constants.expoConfig.version` as the App Store build, so this
 * lenient handling is for the rare hand-edited app.json.
 */

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  ((Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
    "https://getacuity.io");

// Match the static-config shape so the mobile consumer is strongly
// typed against the same contract. Kept inline (vs sharing a `types`
// module) so the mobile bundle doesn't pull in any web-only imports.
export interface VersionCheckConfig {
  minimumVersion: string;
  recommendedVersion: string;
  headline: string;
  body: string;
  ctaText: string;
  dismissible: boolean;
  appStoreUrl: string;
  releaseNotes: string[] | null;
}

export interface VersionCheckResult {
  /** True when the modal should appear on this launch. */
  shouldShow: boolean;
  /** True when minimumVersion gate has tripped — hide "Later". */
  isForced: boolean;
  /** Server config payload. Null when shouldShow is false. */
  config: VersionCheckConfig | null;
}

const DISMISSED_KEY = "update-prompt-dismissed-version";
const FETCH_TIMEOUT_MS = 4000;

/**
 * Strip pre-release / build-metadata suffixes and parse into a
 * fixed-length [major, minor, patch] tuple. Any segment that
 * doesn't parse becomes 0 — defensive against malformed config or
 * `Constants.expoConfig.version` returning something unexpected.
 */
function parseVersion(raw: string): [number, number, number] {
  const cleaned = raw.split(/[-+]/, 1)[0] ?? raw;
  const parts = cleaned.split(".");
  const [major, minor, patch] = [0, 1, 2].map((i) => {
    const n = Number.parseInt(parts[i] ?? "0", 10);
    return Number.isFinite(n) ? n : 0;
  });
  return [major, minor, patch];
}

/** Returns -1 if a < b, 0 if equal, 1 if a > b. */
function compareVersion(a: string, b: string): -1 | 0 | 1 {
  const [aM, am, ap] = parseVersion(a);
  const [bM, bm, bp] = parseVersion(b);
  if (aM !== bM) return aM < bM ? -1 : 1;
  if (am !== bm) return am < bm ? -1 : 1;
  if (ap !== bp) return ap < bp ? -1 : 1;
  return 0;
}

/** `current` strictly less than `target`. */
function isOlderThan(current: string, target: string): boolean {
  return compareVersion(current, target) === -1;
}

function abortableFetch(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

/**
 * Fire the version-check fetch and decide whether the modal should
 * render. Returns `{ shouldShow: false }` on any failure path —
 * network error, timeout, malformed payload, version-string parse
 * failure. The contract is: a working app never gets surprised by
 * this code path.
 */
export async function checkForUpdate(): Promise<VersionCheckResult> {
  const currentVersion = Constants.expoConfig?.version;
  if (!currentVersion) {
    // No version reported (very rare; happens in some dev tooling
    // paths). Bail out so we don't show a "you're outdated" modal
    // to a developer running a custom build.
    return { shouldShow: false, isForced: false, config: null };
  }

  const platform: "ios" | "android" =
    Platform.OS === "ios" ? "ios" : "android";

  let config: VersionCheckConfig;
  try {
    const res = await abortableFetch(
      `${API_BASE_URL}/api/app/version-check?platform=${platform}`,
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) {
      return { shouldShow: false, isForced: false, config: null };
    }
    const json = (await res.json()) as Partial<VersionCheckConfig>;
    // Minimal shape validation — every required field present and a
    // string/boolean of the right type. A drifted/corrupt payload
    // shouldn't crash the client.
    if (
      typeof json.minimumVersion !== "string" ||
      typeof json.recommendedVersion !== "string" ||
      typeof json.headline !== "string" ||
      typeof json.body !== "string" ||
      typeof json.ctaText !== "string" ||
      typeof json.dismissible !== "boolean" ||
      typeof json.appStoreUrl !== "string"
    ) {
      return { shouldShow: false, isForced: false, config: null };
    }
    config = {
      minimumVersion: json.minimumVersion,
      recommendedVersion: json.recommendedVersion,
      headline: json.headline,
      body: json.body,
      ctaText: json.ctaText,
      dismissible: json.dismissible,
      appStoreUrl: json.appStoreUrl,
      releaseNotes:
        Array.isArray(json.releaseNotes) &&
        json.releaseNotes.every((s) => typeof s === "string")
          ? json.releaseNotes
          : null,
    };
  } catch {
    // Network failure / timeout / aborted — silent. The user keeps
    // using the app exactly as they would have.
    return { shouldShow: false, isForced: false, config: null };
  }

  // Force-update gate. If the running app is older than the strict
  // minimum, this overrides any dismiss state — the user MUST
  // update. `dismissible: false` is enforced client-side too.
  const isForced = isOlderThan(currentVersion, config.minimumVersion);
  if (isForced) {
    return {
      shouldShow: true,
      isForced: true,
      config: { ...config, dismissible: false },
    };
  }

  // Soft-nudge gate.
  if (!isOlderThan(currentVersion, config.recommendedVersion)) {
    return { shouldShow: false, isForced: false, config: null };
  }

  // Honor a previous dismiss IF the recommended version hasn't
  // advanced past it. Bumping the server config re-arms the prompt.
  try {
    const dismissedVersion = await AsyncStorage.getItem(DISMISSED_KEY);
    if (
      dismissedVersion &&
      !isOlderThan(dismissedVersion, config.recommendedVersion)
    ) {
      return { shouldShow: false, isForced: false, config: null };
    }
  } catch {
    // AsyncStorage read failure is non-fatal — treat as "no previous
    // dismiss" and show the modal. Edge case; AsyncStorage rarely
    // throws on read.
  }

  return { shouldShow: true, isForced: false, config };
}

/**
 * Persist the recommended version the user just dismissed so we
 * don't re-prompt until the server config moves past it. Fire-and-
 * forget — modal closing shouldn't block on AsyncStorage.
 */
export function rememberDismissal(recommendedVersion: string): void {
  AsyncStorage.setItem(DISMISSED_KEY, recommendedVersion).catch(() => {
    // Persistence failure is acceptable; worst case the user sees
    // the same prompt again on next launch.
  });
}

/**
 * Open the App Store on the device. iOS supports `itms-apps://` for
 * a direct hand-off into the App Store app (no Safari intermediary);
 * we prefer that on iOS and fall back to the `https://` URL the
 * config carries so non-iOS clients (or any odd corner case where
 * canOpenURL says no) still land on a real product page.
 *
 * Returns true when a link opened successfully, false otherwise.
 * Caller (the modal's onUpdate) doesn't auto-dismiss on success —
 * the user has left the app to update; the modal staying visible
 * is fine. The next launch (after they update) passes the version
 * comparison and the modal won't re-show.
 */
export async function openAppStore(httpsUrl: string): Promise<boolean> {
  if (Platform.OS === "ios") {
    // Convert https://apps.apple.com/app/idXXXXX → itms-apps://
    // form. URL parsing kept defensive in case the config carries
    // an unexpected shape.
    const itmsUrl = httpsUrl.replace(/^https?:\/\//, "itms-apps://");
    try {
      const canOpen = await Linking.canOpenURL(itmsUrl);
      if (canOpen) {
        await Linking.openURL(itmsUrl);
        return true;
      }
    } catch {
      // Fall through to the https path.
    }
  }
  try {
    await Linking.openURL(httpsUrl);
    return true;
  } catch {
    return false;
  }
}

// Exports for testing / future consumers.
export { compareVersion, isOlderThan };
