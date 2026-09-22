import AsyncStorage from "@react-native-async-storage/async-storage";

import { cancelAllReminders, cancelAllRandomNudges } from "@/lib/notifications";

/**
 * One-time local-trigger purge (1.6).
 *
 * On-device reminder scheduling is retired as of 1.6 — the SERVER now owns
 * reminder delivery (see the web notifications-twice-daily dispatcher). This
 * function used to be a boot self-heal that RE-scheduled local reminders; that
 * would now double-send against the server push.
 *
 * Its job is now the opposite: a one-time cleanup that CANCELS any local
 * reminder / random-nudge triggers left on the device from a <= 1.5.x install.
 * Those triggers repeat weekly and never self-expire, so an upgraded user would
 * otherwise get the old on-device reminder AND the new server push. We purge
 * them once per install (guarded by a flag so repeat launches are a no-op), and
 * the schedulers in notifications.ts no longer create new ones.
 *
 * Trigger points are unchanged (apps/mobile/app/_layout.tsx): once after
 * AuthGate resolves, and on each AppState → "active". The flag makes all but
 * the first call cheap. Wrapped in try/catch — boot must never crash here.
 */

const LOCAL_PURGE_DONE_KEY = "acuity:reminders:localPurgedV16";

// Signature kept (userId) so the _layout.tsx call site is unchanged, even
// though the purge is user-independent (it clears this device's triggers).
export async function reapplyRemindersIfNeeded(
  _userId: string
): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(LOCAL_PURGE_DONE_KEY);
    if (done) return;

    await cancelAllReminders();
    await cancelAllRandomNudges();
    await AsyncStorage.setItem(LOCAL_PURGE_DONE_KEY, String(Date.now()));
    console.log(
      "[reminders-boot] purged legacy local triggers (server owns reminders as of 1.6)"
    );
  } catch (err) {
    // Swallow — app boot must not crash. Next launch retries the purge
    // (the flag is only set on success).
    console.log("[reminders-boot] purge error (silent):", err);
  }
}
