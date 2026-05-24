import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/lib/api";

/**
 * Expo push-token registration — slice 9b (2026-05-25).
 *
 * Two entry points:
 *
 *   - registerPushTokenAfterRecording(totalRecordings):
 *       Called from the post-record success path. The very first time
 *       the user lands on this with totalRecordings === 2, we ask for
 *       permission. They've felt value (a second recording = "I'm
 *       coming back"). Earlier prompts test cold; later prompts get
 *       lost in the noise. Idempotent across launches via the
 *       PROMPTED_KEY guard.
 *
 *   - refreshPushTokenOnLaunch():
 *       Called from _layout.tsx after AuthGate resolves. If we already
 *       have permission AND the user previously registered, re-fetch
 *       Expo's current token and POST it. Expo can rotate tokens; this
 *       keeps User.pushToken fresh without re-prompting the user.
 *
 * Denial path: stores DENIED_KEY in AsyncStorage so we never re-prompt
 * on subsequent launches. If the user later flips the OS setting on
 * manually, the next call to refreshPushTokenOnLaunch picks it up and
 * registers silently.
 *
 * Server contract: POST /api/user/push-token { token, platform } —
 * the endpoint stores all three columns (pushToken, pushTokenPlatform,
 * pushTokenUpdatedAt) and is safe to call repeatedly.
 *
 * Apple Option-C: this module touches push permissions + the
 * device-registration write only. Push BODY copy is enforced server-
 * side in trial-countdown-push.ts so no in-app code surfaces $ /
 * Subscribe wording.
 */

const PROMPTED_KEY = "acuity.push.prompted_at";
const DENIED_KEY = "acuity.push.denied_at";
const REGISTERED_KEY = "acuity.push.registered_at";
const SECOND_RECORDING_TRIGGER = 2;

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return extra?.eas?.projectId ?? undefined;
}

function currentPlatform(): "ios" | "android" | null {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return null;
}

async function fetchExpoPushToken(): Promise<string | null> {
  const id = projectId();
  if (!id) return null;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return result.data ?? null;
  } catch (err) {
    if (__DEV__) {
      console.log("[push-token] getExpoPushTokenAsync failed:", err);
    }
    return null;
  }
}

async function postPushToken(token: string, platform: "ios" | "android"): Promise<boolean> {
  try {
    const res = await api.post<{ ok: boolean }>("/api/user/push-token", {
      token,
      platform,
    });
    return !!res.ok;
  } catch (err) {
    if (__DEV__) {
      console.log("[push-token] POST /api/user/push-token failed:", err);
    }
    return false;
  }
}

/**
 * Permission ask + first registration. Call from the post-record
 * success path on every record completion; the gating logic decides
 * whether this is the right moment.
 *
 * Gate conditions (all must be true):
 *   - totalRecordings === SECOND_RECORDING_TRIGGER (i.e. exactly 2)
 *   - We've never prompted before (PROMPTED_KEY null)
 *   - User hasn't previously denied (DENIED_KEY null)
 *   - Platform is iOS or Android (push only)
 *   - EAS projectId is configured
 *
 * Returns the outcome so callers can show graceful messaging.
 */
export async function registerPushTokenAfterRecording(
  totalRecordings: number
): Promise<"prompted-and-granted" | "prompted-and-denied" | "skipped" | "error"> {
  const platform = currentPlatform();
  if (!platform) return "skipped";
  if (totalRecordings !== SECOND_RECORDING_TRIGGER) return "skipped";

  try {
    const [prompted, denied] = await Promise.all([
      AsyncStorage.getItem(PROMPTED_KEY),
      AsyncStorage.getItem(DENIED_KEY),
    ]);
    if (prompted || denied) return "skipped";

    // Stamp PROMPTED_KEY BEFORE the OS dialog opens. If the user
    // backgrounds the app mid-dialog the next launch must not re-ask.
    await AsyncStorage.setItem(PROMPTED_KEY, String(Date.now()));

    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: false,
          allowSound: true,
        },
      });
      granted = req.granted;
      if (!granted) {
        await AsyncStorage.setItem(DENIED_KEY, String(Date.now()));
        return "prompted-and-denied";
      }
    }

    const token = await fetchExpoPushToken();
    if (!token) return "error";
    const ok = await postPushToken(token, platform);
    if (!ok) return "error";

    await AsyncStorage.setItem(REGISTERED_KEY, String(Date.now()));
    return "prompted-and-granted";
  } catch (err) {
    if (__DEV__) {
      console.log("[push-token] registerPushTokenAfterRecording threw:", err);
    }
    return "error";
  }
}

/**
 * Launch-time freshness check. Re-POSTs the current Expo token so a
 * rotated token doesn't go stale silently. No-op when we've never
 * registered before, or when permission is currently denied/undetermined.
 *
 * Safe to call on every cold launch — the only network call is the
 * single POST when conditions are met; permission read is local.
 */
export async function refreshPushTokenOnLaunch(): Promise<void> {
  const platform = currentPlatform();
  if (!platform) return;

  try {
    const registered = await AsyncStorage.getItem(REGISTERED_KEY);
    if (!registered) return;

    const current = await Notifications.getPermissionsAsync();
    if (!current.granted) return;

    const token = await fetchExpoPushToken();
    if (!token) return;
    await postPushToken(token, platform);
  } catch (err) {
    if (__DEV__) {
      console.log("[push-token] refreshPushTokenOnLaunch threw:", err);
    }
  }
}
