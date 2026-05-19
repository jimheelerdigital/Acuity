import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import { api } from "@/lib/api";
import {
  applyMultiReminderSchedule,
  getPermissionStatus,
} from "@/lib/notifications";

/**
 * Boot self-heal for cleared local reminder schedules (Slice P2,
 * 2026-05-19). Fixes RC3 — iOS reinstall / major-OS upgrade /
 * restore-from-backup wiping the scheduled-notification list while
 * server prefs still say `notificationsEnabled = true`. Without this,
 * the user's reminders silently stop until they re-open Profile →
 * Reminders and tap Save.
 *
 * Trigger points (see apps/mobile/app/_layout.tsx):
 *   - Once after AuthGate resolves an authenticated user
 *   - Each time AppState transitions to "active"
 *
 * Throttled to once per 6 hours via AsyncStorage so foregrounding the
 * app many times in a row only hits the network on the first one.
 *
 * Idempotent — if the server says X reminders should be scheduled and
 * the device already has all the matching triggers, we do nothing.
 * The check is per-reminder-id (not just a totals comparison) so a
 * partial loss for one reminder triggers a reschedule.
 *
 * Failure handling: every code path is inside one try/catch that logs
 * and swallows. App boot must never crash because of this self-heal.
 */

const LAST_BOOT_REAPPLY_KEY = "acuity:reminders:lastBootReapply";
const REAPPLY_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6 hours

// Must match notifications.ts ID_PREFIX. Identifier scheme set by
// applyMultiReminderSchedule: `acuity:reminder:<reminderId>:<weekday>`.
// Legacy single-mode triggers from pre-Slice-C use the shorter
// `acuity:reminder:<weekday>` shape — those are picked up as
// orphaned (don't match any reminder id) which forces a reschedule
// and cleans them up via applyMultiReminderSchedule's cancel-then-
// reschedule.
const ID_PREFIX = "acuity:reminder:";

type ServerReminder = {
  id: string;
  time: string;
  daysActive: number[];
  enabled: boolean;
  sortOrder: number;
};

export async function reapplyRemindersIfNeeded(
  userId: string
): Promise<void> {
  try {
    // Throttle check first — cheapest read, avoids hammering the API
    // when the user backgrounds + foregrounds rapidly.
    const lastRaw = await AsyncStorage.getItem(LAST_BOOT_REAPPLY_KEY);
    const last = lastRaw ? Number(lastRaw) : 0;
    const now = Date.now();
    if (Number.isFinite(last) && last > 0 && now - last < REAPPLY_THROTTLE_MS) {
      const minsAgo = Math.round((now - last) / 60000);
      console.log(
        `[reminders-boot] skipped, throttled (last run ${minsAgo}m ago)`
      );
      return;
    }

    // Permission gate. If the OS isn't granting notifications, there
    // is nothing to schedule — but still bump the throttle so we
    // don't keep poking the server on every foreground.
    const permission = await getPermissionStatus();
    if (permission !== "granted") {
      console.log(
        `[reminders-boot] skipped, permission=${permission} (user=${userId})`
      );
      await AsyncStorage.setItem(LAST_BOOT_REAPPLY_KEY, String(now));
      return;
    }

    // Authoritative server state. Master toggle lives on User; the
    // per-reminder rows live on UserReminder. Both are needed because
    // applyMultiReminderSchedule cuts the whole list if masterEnabled
    // is false.
    const [meRes, listRes] = await Promise.all([
      api.get<{ user: { notificationsEnabled?: boolean } }>("/api/user/me"),
      api.get<{ reminders: ServerReminder[] }>("/api/account/reminders"),
    ]);

    const masterEnabled = !!meRes.user?.notificationsEnabled;
    const reminders = listRes.reminders ?? [];
    const activeReminders = reminders.filter(
      (r) => r.enabled && r.daysActive.length > 0
    );

    const expectedTriggers = masterEnabled
      ? activeReminders.reduce((sum, r) => sum + r.daysActive.length, 0)
      : 0;

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const oursAll = scheduled.filter((s) =>
      s.identifier.startsWith(ID_PREFIX)
    );

    // Count multi-format triggers per reminder id. 4-segment
    // identifiers are `acuity:reminder:<reminderId>:<weekday>`; older
    // 3-segment identifiers are unmapped to a reminder row and count
    // as orphans for this purpose.
    const triggersByReminderId = new Map<string, number>();
    for (const s of oursAll) {
      const parts = s.identifier.split(":");
      if (parts.length === 4 && parts[2]) {
        triggersByReminderId.set(
          parts[2],
          (triggersByReminderId.get(parts[2]) ?? 0) + 1
        );
      }
    }

    let needsReschedule = false;
    if (masterEnabled) {
      // Per-reminder check: any active reminder with zero matching
      // triggers means a missing schedule.
      for (const r of activeReminders) {
        if ((triggersByReminderId.get(r.id) ?? 0) === 0) {
          needsReschedule = true;
          break;
        }
      }
      // Totals check catches the case where a reminder has some
      // triggers but is missing one weekday (partial-loss), and also
      // catches orphaned legacy 3-segment triggers that need cleanup.
      if (!needsReschedule && oursAll.length !== expectedTriggers) {
        needsReschedule = true;
      }
    } else if (oursAll.length > 0) {
      // Master off but stale local triggers exist — clean up.
      needsReschedule = true;
    }

    console.log(
      `[reminders-boot] checked schedule, ${oursAll.length} triggers found, ${expectedTriggers} expected`
    );

    if (!needsReschedule) {
      await AsyncStorage.setItem(LAST_BOOT_REAPPLY_KEY, String(now));
      return;
    }

    const outcome = await applyMultiReminderSchedule({
      masterEnabled,
      reminders: activeReminders.map((r) => ({
        id: r.id,
        time: r.time,
        daysActive: r.daysActive,
        enabled: r.enabled,
      })),
    });

    if (outcome.kind === "scheduled") {
      console.log(
        `[reminders-boot] re-applied schedule for ${outcome.remindersScheduled} reminders (${outcome.totalTriggers} triggers)`
      );
    } else {
      console.log(
        `[reminders-boot] re-applied schedule, outcome=${outcome.kind}`
      );
    }

    await AsyncStorage.setItem(LAST_BOOT_REAPPLY_KEY, String(now));
  } catch (err) {
    // Swallow — app boot must not crash because of this. Console log
    // so the cause is visible in `npx react-native log-ios` during QA.
    console.log("[reminders-boot] error (silent):", err);
  }
}
