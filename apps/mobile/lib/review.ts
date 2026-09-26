import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Linking } from "react-native";
import * as StoreReview from "expo-store-review";

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
