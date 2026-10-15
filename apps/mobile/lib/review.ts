import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Linking } from "react-native";
import Constants from "expo-constants";
import * as StoreReview from "expo-store-review";

import { api } from "@/lib/api";

/**
 * Review prompts — App Store / Play compliant.
 *
 * Rules we follow (both stores prohibit the alternatives):
 *  - In-app rating uses the OS-native prompt (SKStoreReviewController / Play
 *    In-App Review) via expo-store-review. No custom star UI, no "give us 5
 *    stars", no reward for reviewing. The OS self-limits how often it shows.
 *  - The "Enjoying Ripple?" nudge only ARMS after a positive signal (completed
 *    debriefs), is frequency-capped, and can be turned off — so it never nags.
 *  - We can't detect who actually reviewed (Apple/Google don't expose it), so
 *    once a user takes the rate action we set `rated` and stop nudging.
 */

const K = {
  signal: "review.signalCount", // completed debriefs (positive signal)
  shown: "review.promptsShown",
  lastShown: "review.lastShownAt",
  rated: "review.rated",
  off: "review.dismissedForever",
  // Per-ACCOUNT state for the automatic native ask (suffix = User.id).
  seenPrefix: "review.seenDebriefs.", // last server count we saw
  askedVersionPrefix: "review.askedVersion.", // app version we last asked on
  askedAtPrefix: "review.askedAt.", // when we last asked (epoch ms)
};

// Gating knobs.
const MIN_SIGNAL = 2; // ask only after they've felt the value
const MIN_DAYS_BETWEEN = 45;
const MAX_PROMPTS = 3; // lifetime nudge cap (native prompt self-limits too)

const ASC_APP_ID = "6762633410";
const ANDROID_PKG = "com.heelerdigital.acuity";

async function num(key: string): Promise<number> {
  const v = await AsyncStorage.getItem(key);
  return v ? Number(v) || 0 : 0;
}
async function flag(key: string): Promise<boolean> {
  return (await AsyncStorage.getItem(key)) === "1";
}

/** Count a completed debrief — the positive signal that arms the nudge. */
export async function bumpDebriefSignal(): Promise<void> {
  try {
    await AsyncStorage.setItem(K.signal, String((await num(K.signal)) + 1));
  } catch {
    // best-effort
  }
}

/** Completed debriefs at which we make the automatic native ask. */
export const AUTO_ASK_AT_DEBRIEFS = 2;
/** Minimum gap between asks ("a week or two" — Apple HIG). */
export const MIN_DAYS_BETWEEN_ASKS = 14;

/**
 * Pure gate for the automatic native ask (unit-testable).
 *
 * Ask when ALL hold:
 *   - a debrief just completed (server count went up since we last looked),
 *     so the ask lands at the end of a success, never on a cold launch;
 *   - the account has >= 2 completed debriefs;
 *   - we haven't asked on THIS app version yet (Apple's own sample pattern),
 *     so people who tapped "Not Now" get asked again after an update;
 *   - at least 14 days since the last ask;
 *   - they haven't turned asks off or tapped "Rate Ripple" in Settings.
 * Apple then decides whether to actually show it: max 3 times per 365 days,
 * and not to people who've already left feedback. Apps are never told
 * whether someone rated, so this is the most we can know.
 */
export function shouldAutoAsk(input: {
  completedDebriefs: number;
  lastSeenDebriefs: number | null;
  appVersion: string | null;
  lastAskedVersion: string | null;
  lastAskedAt: number | null;
  turnedOff: boolean;
  rated: boolean;
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  if (input.turnedOff || input.rated) return false;
  if (input.completedDebriefs < AUTO_ASK_AT_DEBRIEFS) return false;
  // First time we see this account on this device (e.g. right after this
  // update ships): just record the count. Ask on their next debrief.
  if (input.lastSeenDebriefs == null) return false;
  if (input.completedDebriefs <= input.lastSeenDebriefs) return false;
  if (input.appVersion && input.lastAskedVersion === input.appVersion) return false;
  if (input.lastAskedAt != null && now - input.lastAskedAt < MIN_DAYS_BETWEEN_ASKS * 86_400_000) {
    return false;
  }
  return true;
}

function currentAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

/**
 * Apple's / Google's own rating pop-up — first after the 2nd completed
 * debrief (Ripple App Planner: "AFTER 2ND RECORDING — use Apple's built-in
 * rating pop-up"; decided 2026-10-10), then again once per new app version
 * for people who haven't rated (decided 2026-10-15). See shouldAutoAsk.
 *
 * Fixed 2026-10-15: the 1.9.0 version never fired in practice — it only ran
 * from the in-app processing notifier (skipped when the user waited on the
 * record screen, and stopped when they left the app) and counted per
 * install. Now the count is the server's `totalRecordings`, read from data
 * the app already loads (no extra requests once prefetched), and state is
 * kept per account on the device.
 *
 * Only the OS-native prompt — never a fallback to the store page, which may
 * only open from an explicit tap. Never shows in TestFlight builds.
 */
let askInFlight = false;

export async function maybeAskForReviewAfterDebrief(prefetched?: {
  id?: string | null;
  totalRecordings?: number | null;
}): Promise<void> {
  // Several triggers (record screen, notifier, user refresh) can land at once.
  if (askInFlight) return;
  askInFlight = true;
  try {
    let userId = prefetched?.id ?? null;
    let total = prefetched?.totalRecordings ?? null;
    if (!userId || total == null) {
      const me = await api.get<{ user?: { id?: string; totalRecordings?: number } }>(
        "/api/user/me"
      );
      userId = me.user?.id ?? null;
      total = me.user?.totalRecordings ?? 0;
    }
    if (!userId || total == null) return;

    const seenKey = `${K.seenPrefix}${userId}`;
    const versionKey = `${K.askedVersionPrefix}${userId}`;
    const atKey = `${K.askedAtPrefix}${userId}`;
    const seenRaw = await AsyncStorage.getItem(seenKey);
    const lastSeen = seenRaw == null ? null : Number(seenRaw) || 0;
    const appVersion = currentAppVersion();

    const ok = shouldAutoAsk({
      completedDebriefs: total,
      lastSeenDebriefs: lastSeen,
      appVersion,
      lastAskedVersion: await AsyncStorage.getItem(versionKey),
      lastAskedAt: (await num(atKey)) || null,
      turnedOff: await flag(K.off),
      rated: await flag(K.rated),
    });
    if (lastSeen == null || total > lastSeen) {
      await AsyncStorage.setItem(seenKey, String(total));
    }
    if (!ok) return;
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
    if (appVersion) await AsyncStorage.setItem(versionKey, appVersion);
    await AsyncStorage.setItem(atKey, String(Date.now()));
    // Let the entry screen land first so the sheet appears over the result,
    // not over a navigation transition (Apple: don't interrupt).
    await new Promise((r) => setTimeout(r, 2000));
    await StoreReview.requestReview();
  } catch {
    // best-effort — a review ask must never break the debrief flow
  } finally {
    askInFlight = false;
  }
}

/** Whether to show the "Enjoying Ripple?" nudge right now. */
export async function shouldShowNudge(): Promise<boolean> {
  try {
    if (await flag(K.off)) return false;
    if (await flag(K.rated)) return false;
    if ((await num(K.signal)) < MIN_SIGNAL) return false;
    if ((await num(K.shown)) >= MAX_PROMPTS) return false;
    const last = await num(K.lastShown);
    if (last > 0) {
      const days = (Date.now() - last) / 86_400_000;
      if (days < MIN_DAYS_BETWEEN) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function markNudgeShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(K.shown, String((await num(K.shown)) + 1));
    await AsyncStorage.setItem(K.lastShown, String(Date.now()));
  } catch {
    // best-effort
  }
}

export async function markRated(): Promise<void> {
  try {
    await AsyncStorage.setItem(K.rated, "1");
  } catch {
    // best-effort
  }
}

export async function turnOffNudges(): Promise<void> {
  try {
    await AsyncStorage.setItem(K.off, "1");
  } catch {
    // best-effort
  }
}

/**
 * Ask for a rating. Prefers the OS-native prompt; falls back to opening the
 * store's write-review page. Safe to call from an explicit "Rate Ripple" tap.
 */
export async function requestReview(): Promise<void> {
  try {
    if (
      (await StoreReview.isAvailableAsync()) &&
      (await StoreReview.hasAction())
    ) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    // fall through to the store URL
  }
  await openStoreReviewPage();
}

/** Open the store's review page directly (explicit user action only). */
export async function openStoreReviewPage(): Promise<void> {
  const url =
    Platform.OS === "ios"
      ? `itms-apps://apps.apple.com/app/id${ASC_APP_ID}?action=write-review`
      : `market://details?id=${ANDROID_PKG}`;
  try {
    await Linking.openURL(url);
  } catch {
    // best-effort
  }
}
