import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { compareVersion, type VersionCheckConfig } from "@/lib/version-check";
import {
  WHATS_NEW_RELEASES,
  type WhatsNewItem,
} from "@/lib/whats-new-content";

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
 *
 * 1.9.1: content now ships in the app (lib/whats-new-content.ts) so the sheet
 * shows on every update without a server step; the server notes above are
 * only a fallback. Also, someone updating from a build older than 1.8 has no
 * stored version; primeWhatsNewInstallState (called by auth-context at
 * launch with the existing "has launched before" flag) tells that upgrade
 * apart from a brand-new install so those people see the sheet too.
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
  /** Plain bullets (server fallback). */
  notes: string[] | null;
  /** Rich, tappable items (bundled content). Preferred when present. */
  items: WhatsNewItem[] | null;
}

const NONE: WhatsNewResult = {
  shouldShow: false,
  version: null,
  notes: null,
  items: null,
};

/**
 * Newest bundled release with seen < version <= current, filtered to this
 * platform. Null when there's nothing to show.
 */
export function bundledWhatsNew(
  seen: string,
  current: string,
  platform: "ios" | "android"
): WhatsNewItem[] | null {
  const release = WHATS_NEW_RELEASES.filter(
    (r) =>
      compareVersion(seen, r.version) === -1 &&
      compareVersion(r.version, current) !== 1
  ).sort((a, b) => compareVersion(b.version, a.version))[0];
  if (!release) return null;
  const items = release.items.filter(
    (i) => !i.platform || i.platform === platform
  );
  return items.length > 0 ? items : null;
}

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
/**
 * Called once at launch by auth-context with `hasLaunchedBefore` (the
 * `acuity_has_launched` flag every build since May 2026 writes), read
 * BEFORE this launch marks it. Only acts when no What's New version is
 * stored yet:
 *   - launched before → an older build was here → store "0.0.0" so this
 *     update's sheet shows.
 *   - never launched  → brand-new install → store the current version so
 *     nothing interrupts onboarding.
 */
export async function primeWhatsNewInstallState(
  hasLaunchedBefore: boolean
): Promise<void> {
  const current = Constants.expoConfig?.version;
  if (!current) return;
  try {
    const seen = await AsyncStorage.getItem(SEEN_KEY);
    if (seen) return;
    await setSeen(hasLaunchedBefore ? "0.0.0" : current);
  } catch {
    // Non-fatal: checkWhatsNew baselines silently when nothing is stored.
  }
}

export async function checkWhatsNew(): Promise<WhatsNewResult> {
  const current = Constants.expoConfig?.version;
  if (!current) return NONE;

  let seen: string | null = null;
  try {
    seen = await AsyncStorage.getItem(SEEN_KEY);
  } catch {
    // Treat a read failure as "unknown" → baseline below.
  }

  // Nothing stored (priming failed): baseline silently, never interrupt.
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

  const items = bundledWhatsNew(seen, current, platform);
  if (items) {
    return { shouldShow: true, version: current, notes: null, items };
  }

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

    return { shouldShow: true, version: current, notes, items: null };
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
