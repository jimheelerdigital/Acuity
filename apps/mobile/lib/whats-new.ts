import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { compareVersion, type VersionCheckConfig } from "@/lib/version-check";

/**
 * "What's New" client (Ripple 1.8, workstream 4).
 *
 * Complements the update prompt: that nudges users who are BEHIND to update;
 * this celebrates what changed for users who JUST updated and are now current.
 * The two are mutually exclusive by construction — we only show What's New when
 * the running version exactly equals the server's recommendedVersion (i.e. the
 * release notes describe the build they're actually on), which is precisely
 * when the update prompt does NOT fire.
 *
 * Reuses the existing `/api/app/version-check` config (releaseNotes) so there's
 * one place to edit per release (`app-version-config.ts`) — no second notes
 * source to maintain.
 *
 * Shows once per version: gated on a stored last-seen version. A brand-new
 * install is baselined silently (no sheet) so onboarding isn't interrupted —
 * we only ever celebrate an actual upgrade.
 */

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  ((Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
    "https://goripple.io");

const SEEN_KEY = "whats-new-seen-version";
const FETCH_TIMEOUT_MS = 4000;

export interface WhatsNewResult {
  shouldShow: boolean;
  version: string | null;
  notes: string[] | null;
}

const NONE: WhatsNewResult = { shouldShow: false, version: null, notes: null };

function abortableFetch(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

async function setSeen(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, version);
  } catch {
    // Non-fatal: worst case the sheet reappears next launch.
  }
}

/**
 * Decide whether to show the What's New sheet on this launch. Silent on every
 * failure path (no version, network error, malformed payload) — a working app
 * never gets surprised by this.
 */
export async function checkWhatsNew(): Promise<WhatsNewResult> {
  const current = Constants.expoConfig?.version;
  if (!current) return NONE;

  let seen: string | null = null;
  try {
    seen = await AsyncStorage.getItem(SEEN_KEY);
  } catch {
    // Treat a read failure as "unknown" → baseline below.
  }

  // First run of a What's-New-aware build: baseline silently, never interrupt.
  if (!seen) {
    await setSeen(current);
    return NONE;
  }
  if (seen === current) return NONE;
  // Only celebrate an upgrade (seen < current). Same version handled above;
  // a downgrade (seen > current) just re-baselines and skips.
  if (compareVersion(seen, current) !== -1) {
    await setSeen(current);
    return NONE;
  }

  const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";
  try {
    const res = await abortableFetch(
      `${API_BASE_URL}/api/app/version-check?platform=${platform}`,
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) return NONE;
    const json = (await res.json()) as Partial<VersionCheckConfig>;

    // Only show when the notes describe the version they're actually on.
    if (
      typeof json.recommendedVersion !== "string" ||
      compareVersion(current, json.recommendedVersion) !== 0
    ) {
      return NONE;
    }
    const notes =
      Array.isArray(json.releaseNotes) &&
      json.releaseNotes.every((s) => typeof s === "string")
        ? json.releaseNotes
        : null;
    if (!notes || notes.length === 0) return NONE;

    return { shouldShow: true, version: current, notes };
  } catch {
    return NONE;
  }
}

/**
 * Persist that the user has seen What's New for this version. Fire-and-forget.
 */
export function rememberWhatsNewSeen(version: string): void {
  void setSeen(version);
}
