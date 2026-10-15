import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Linking } from "react-native";
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
  // Per-ACCOUNT marker for the automatic native ask (suffix = User.id).
  autoAskedPrefix: "review.autoAsked.",
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

/** Pure gate for the automatic ask (unit-tested). */
export function shouldAutoAsk(input: {
  completedDebriefs: number;
  alreadyAsked: boolean;
  turnedOff: boolean;
  rated: boolean;
}): boolean {
  return (
    !input.alreadyAsked &&
    !input.turnedOff &&
    !input.rated &&
    input.completedDebriefs >= AUTO_ASK_AT_DEBRIEFS
  );
}

/**
 * Apple's / Google's own rating pop-up after the 2nd completed debrief
 * (Ripple App Planner: "AFTER 2ND RECORDING — use Apple's built-in rating
 * pop-up"; decided 2026-10-10).
 *
 * Fixed 2026-10-15 (1.9.1). The 1.9 version never fired in the normal flow:
 * it ran only from the global processing notifier, and record.tsx takes the
 * entry off the notifier when the user waits on the record screen — the
 * usual path — so the debrief was never counted. It also counted debriefs
 * per INSTALL, not per account. Now:
 *   - the count is the server's `totalRecordings` (bumped when processing
 *     completes), so it's right on any device and any completion path;
 *   - it's called from every completion path (record screen + notifier)
 *     AND when the signed-in user the auth context already loads changes
 *     ((tabs)/_layout.tsx — no extra request), so leaving or closing the
 *     app can't skip it;
 *   - "already asked" is remembered per account on this device.
 * Fires once per account per device when the count is >= 2, so people
 * already past 2 debriefs get asked on their next one.
 *
 * Only the OS-native prompt — never a fallback to the store page, which may
 * only open from an explicit tap. The OS still decides whether it actually
 * appears (Apple: max 3 times a year; never in TestFlight builds).
 */
let askInFlight = false;

export async function maybeAskForReviewAfterDebrief(prefetched?: {
  id?: string | null;
  totalRecordings?: number | null;
}): Promise<void> {
  // Several triggers (foreground, record screen, notifier) can land at once.
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
    if (!userId) return;
    const askedKey = `${K.autoAskedPrefix}${userId}`;
    const ok = shouldAutoAsk({
      completedDebriefs: total ?? 0,
      alreadyAsked: await flag(askedKey),
      turnedOff: await flag(K.off),
      rated: await flag(K.rated),
    });
    if (!ok) return;
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
    await AsyncStorage.setItem(askedKey, "1");
    // Let the entry screen land first so the sheet appears over the result,
    // not over a navigation transition.
    await new Promise((r) => setTimeout(r, 1500));
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
