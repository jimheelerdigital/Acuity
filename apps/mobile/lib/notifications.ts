import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Local-notification scheduling for the daily journaling reminder.
 *
 * Model: given `notificationTime` (HH:MM local) and `notificationDays`
 * (0..6, where 0 = Sunday), we create one CALENDAR trigger per day
 * that fires at that local time on that weekday. expo-notifications
 * auto-repeats weekly triggers, so a single schedule persists forever
 * until we cancel.
 *
 * Cancel-then-reschedule pattern (not incremental diff) — when the
 * user changes ANY preference we tear down everything we previously
 * scheduled under our ID namespace and rebuild. Keeps the ordering
 * simple and avoids a consistency bug where a stale trigger survives
 * a day-removal change.
 *
 * iOS note: expo-notifications delivers local notifications even
 * when the app is killed. No push token, no server — this is all
 * on-device. Android 13+ additionally requires the POST_NOTIFICATIONS
 * runtime permission, which requestPermissionAsync handles.
 */

// Prefix every identifier we schedule so cancel-by-prefix is possible.
// Format: acuity:reminder:<weekday-int>
const ID_PREFIX = "acuity:reminder:";

// Rotated body copy. Kept local (not fetched from the server) so the
// notification fires even when the device has no network at trigger
// time. The rotation seeds from (weekday + week-of-year) so the user
// sees variety without back-to-back repeats.
const BODY_VARIATIONS = [
  "Your nightly brain dump is waiting.",
  "Take 60 seconds. What's on your mind?",
  "How was today, really?",
  "Say it out loud. You'll feel lighter.",
  "One minute. Your future self will thank you.",
];

function pickBody(weekday: number, weekOfYear: number): string {
  const idx = Math.abs(weekday * 7 + weekOfYear) % BODY_VARIATIONS.length;
  return BODY_VARIATIONS[idx];
}

function weekOfYearNow(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Set global notification behaviour. Called once at app boot —
 * foreground notifications default to silent on iOS; we want banner +
 * sound so a reminder that fires while the user has the app open is
 * still visible.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PermissionStatus = "granted" | "denied" | "undetermined";

/**
 * Request or read the current notification permission. iOS's
 * per-provider permission dialog can only be triggered once; a user
 * who denied earlier has to enable in Settings. Callers should show
 * a "Open Settings" affordance when this returns "denied" after the
 * initial ask.
 */
export async function requestNotificationPermission(): Promise<PermissionStatus> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return "granted";
  // iOS may report status="undetermined" with ios.status=2 (provisional).
  // We treat provisional as granted — provisional notifs deliver silently
  // to the notification center, which is acceptable for a nightly reminder.
  if (
    current.ios?.status ===
    Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return "granted";
  }
  if (current.status === "denied") return "denied";

  const req = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
      provideAppNotificationSettings: true,
    },
  });
  if (req.granted) return "granted";
  if (req.status === "denied") return "denied";
  return "undetermined";
}

export async function getPermissionStatus(): Promise<PermissionStatus> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return "granted";
  if (
    current.ios?.status ===
    Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return "granted";
  }
  if (current.status === "denied") return "denied";
  return "undetermined";
}

/**
 * Cancel every reminder we scheduled under our ID prefix. Leaves
 * unrelated scheduled notifications (if any) alone — defensive against
 * a future feature that also schedules locally.
 */
export async function cancelAllReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((s) => s.identifier.startsWith(ID_PREFIX))
      .map((s) =>
        Notifications.cancelScheduledNotificationAsync(s.identifier)
      )
  );
}

/**
 * Cancel existing reminders, then (if enabled + permission granted +
 * days non-empty) schedule a fresh set — one weekly trigger per day
 * in `notificationDays`. Time is the user's local HH:MM.
 *
 * Returns an outcome the caller can surface in the UI:
 *   - "scheduled" — everything in place, N weekly triggers.
 *   - "disabled" — caller asked for off / empty days; we cleared.
 *   - "permission-denied" — enabled in app but OS says no. Caller
 *      should show "Open Settings" hint. We still clear any stale
 *      triggers so the world is consistent.
 */
export type ScheduleOutcome =
  | { kind: "scheduled"; count: number }
  | { kind: "disabled" }
  | { kind: "permission-denied" };

export async function applyReminderSchedule({
  enabled,
  time,
  days,
}: {
  enabled: boolean;
  time: string; // "HH:MM"
  days: number[]; // 0..6, Sun=0
}): Promise<ScheduleOutcome> {
  await cancelAllReminders();

  if (!enabled || days.length === 0) {
    return { kind: "disabled" };
  }

  const status = await getPermissionStatus();
  if (status !== "granted") {
    return { kind: "permission-denied" };
  }

  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return { kind: "disabled" };
  }

  const weekOfYear = weekOfYearNow();

  await Promise.all(
    days.map((weekday) =>
      Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${weekday}`,
        content: {
          title: "Acuity",
          body: pickBody(weekday, weekOfYear),
          sound: "default",
          data: { deepLink: "acuity://" },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          // Notifications `weekday` is 1-based Sunday=1; our API uses
          // 0..6 with Sun=0. Map at the boundary.
          weekday: weekday + 1,
          hour,
          minute,
          repeats: true,
        },
      })
    )
  );

  return { kind: "scheduled", count: days.length };
}

/**
 * Multi-reminder scheduler (Slice C, 2026-05-09). Cancel-then-
 * reschedule a list of N reminders, each with its own time + days +
 * enabled flag. Master `enabled` cuts the entire list.
 *
 * Identifier scheme: `acuity:reminder:<reminderId>:<weekday>`. Each
 * reminder gets up to 7 scheduled OS triggers (one per active
 * weekday). The shared ID_PREFIX means `cancelAllReminders` still
 * clears every identifier we own — single-time AND multi-reminder
 * flows share the cancel surface.
 *
 * Returns a per-reminder breakdown so the caller can show "3
 * reminders scheduled" etc. and surface permission state cleanly.
 */
export type MultiReminderInput = {
  id: string;
  time: string; // "HH:MM"
  daysActive: number[]; // 0..6, Sun=0
  enabled: boolean;
};

export type MultiScheduleOutcome =
  | { kind: "scheduled"; totalTriggers: number; remindersScheduled: number }
  | { kind: "disabled" }
  | { kind: "permission-denied" };

export async function applyMultiReminderSchedule({
  masterEnabled,
  reminders,
}: {
  masterEnabled: boolean;
  reminders: MultiReminderInput[];
}): Promise<MultiScheduleOutcome> {
  await cancelAllReminders();

  if (!masterEnabled || reminders.length === 0) {
    return { kind: "disabled" };
  }

  // Pre-filter reminders that contribute zero triggers — disabled OR
  // empty daysActive. If after filtering nothing remains, treat the
  // whole save as a disable so the UI surfaces "no active reminders"
  // rather than "scheduled 0".
  const active = reminders.filter(
    (r) => r.enabled && r.daysActive.length > 0
  );
  if (active.length === 0) {
    return { kind: "disabled" };
  }

  const status = await getPermissionStatus();
  if (status !== "granted") {
    return { kind: "permission-denied" };
  }

  const weekOfYear = weekOfYearNow();

  let totalTriggers = 0;
  await Promise.all(
    active.flatMap((reminder) => {
      const [hourStr, minuteStr] = reminder.time.split(":");
      const hour = Number(hourStr);
      const minute = Number(minuteStr);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        // Skip a reminder with malformed time rather than failing the
        // whole batch. Server-side validation should prevent this,
        // but defensive on client too.
        return [];
      }
      return reminder.daysActive.map((weekday) => {
        totalTriggers += 1;
        return Notifications.scheduleNotificationAsync({
          identifier: `${ID_PREFIX}${reminder.id}:${weekday}`,
          content: {
            title: "Acuity",
            body: pickBody(weekday, weekOfYear),
            sound: "default",
            data: { deepLink: "acuity://", reminderId: reminder.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
            // expo-notifications uses 1-based Sunday=1; our API uses
            // 0..6 with Sun=0. Map at the boundary (same as the
            // single-time scheduler above).
            weekday: weekday + 1,
            hour,
            minute,
            repeats: true,
          },
        });
      });
    })
  );

  return {
    kind: "scheduled",
    totalTriggers,
    remindersScheduled: active.length,
  };
}

/**
 * Debug helper — returns the identifiers of every reminder we have
 * scheduled right now. Not used in production code; handy from the
 * dev console or a future "Send test reminder" affordance.
 */
export async function listReminderIds(): Promise<string[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled
    .filter((s) => s.identifier.startsWith(ID_PREFIX))
    .map((s) => s.identifier);
}
