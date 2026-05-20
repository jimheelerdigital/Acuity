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
//
// 2026-05-20 fix: time-aware pools. The legacy single string pool
// was nightly-only ("Your nightly brain dump is waiting..."), which
// was fine when the only reminder slot was an evening one. Slice C
// (2026-05-09) added multi-reminder support — users can configure
// reminders at any hour. The nightly copy fired at 11am for Keenan
// was the result of that mismatch. Now we split into three pools
// keyed off the fire-hour:
//
//   < 10:00       → MORNING_BODIES
//   10:00–17:59   → MIDDAY_BODIES  (matches the P3A daytime window)
//   18:00 onward  → EVENING_BODIES (original strings; preserves the
//                                   nightly identity for the 95% of
//                                   users who do journal at night)
//
// Boundary at 10:00 / 18:00 picked to mirror the P3A random-nudge
// window so the user's mental model stays consistent: "workday
// hours" = midday, "after work" = evening.
const MORNING_BODIES = [
  "Quick check-in before the day starts.",
  "60 seconds — what's on your mind this morning?",
  "Take stock. The day's still wide open.",
  "What does today need from you?",
  "How are you walking in today?",
];

const MIDDAY_BODIES = [
  "Quick check-in. What's surfacing?",
  "Pause for a minute. How's it going?",
  "What's loud right now? Talk it out.",
  "Halfway through. What's the day actually been?",
  "60 seconds. Get it off your chest.",
];

const EVENING_BODIES = [
  "Your nightly brain dump is waiting.",
  "Take 60 seconds. What's on your mind?",
  "How was today, really?",
  "Say it out loud. You'll feel lighter.",
  "One minute. Your future self will thank you.",
];

function pickBody(
  weekday: number,
  weekOfYear: number,
  hour: number
): string {
  const pool =
    hour < 10
      ? MORNING_BODIES
      : hour < 18
        ? MIDDAY_BODIES
        : EVENING_BODIES;
  const idx = Math.abs(weekday * 7 + weekOfYear) % pool.length;
  return pool[idx];
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
          // `hour` already parsed above from `time`. Pass through so
          // pickBody can pick the right (morning/midday/evening) pool.
          body: pickBody(weekday, weekOfYear, hour),
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
            // Per-reminder `hour` parsed above. Each reminder in a
            // multi-reminder set picks copy independently — a 7am
            // reminder gets MORNING_BODIES, an 8pm gets EVENING_BODIES.
            body: pickBody(weekday, weekOfYear, hour),
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

// ─── Random nudge (Slice P3A, 2026-05-19) ──────────────────────────
//
// One unpredictable check-in per day, in addition to the user's
// preferred-time reminder. Local-only via expo-notifications DATE
// triggers — no APNs, no server, no push token. Pre-schedules a
// rolling 7-day window of one-shot triggers. Each fire is consumed
// by iOS; the boot self-heal (notifications-boot.ts) tops up the
// window on every foreground.
//
// Identifier scheme: `acuity:random:YYYY-MM-DD` — one per calendar
// day. Distinct prefix from main reminders so cancel-by-prefix
// surfaces don't bleed between the two systems.
//
// Constraints:
//   - Only fires on weekdays the user has active in any main reminder.
//   - Fires within RANDOM_WINDOW_START_HOUR..RANDOM_WINDOW_END_HOUR
//     local (10am–6pm by default — daytime window most users aren't
//     already covered by morning/evening main reminders).
//   - Doesn't fire within RANDOM_BUFFER_MINUTES of any main reminder
//     time (re-rolled up to 10 times; skipped for that day if no
//     conflict-free slot fits).

const RANDOM_ID_PREFIX = "acuity:random:";

// 10am inclusive .. 6pm exclusive. Daytime so morning/evening main
// reminders rarely conflict.
const RANDOM_WINDOW_START_HOUR = 10;
const RANDOM_WINDOW_END_HOUR = 18;

// Minutes of separation required between the random fire and any
// main reminder time. 2h gives breathing room — back-to-back
// notifications feel spammy.
const RANDOM_BUFFER_MINUTES = 120;

// Copy distinct from main reminders. Tone is lighter — "check in"
// rather than "do your nightly journal".
const RANDOM_BODY_VARIATIONS = [
  "Quick check-in. What's on your mind right now?",
  "Pause for 30 seconds. What just happened?",
  "How are you actually doing?",
  "Got something to get off your chest?",
  "Two sentences. What's loud in your head?",
  "Mini brain dump — go.",
];

export interface RandomNudgeScheduleInput {
  /** Union of `daysActive` across all enabled reminders (0..6, Sun=0). */
  activeWeekdays: number[];
  /** HH:MM times of every enabled main reminder. Used for buffer check. */
  mainTimes: string[];
}

export type RandomNudgeOutcome =
  | { kind: "scheduled"; count: number }
  | { kind: "disabled" }
  | { kind: "permission-denied" };

function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Pick a random fire-time inside the daytime window that isn't within
 * RANDOM_BUFFER_MINUTES of any main reminder. Returns null after 10
 * failed re-rolls (too dense to fit) — caller skips that day.
 */
function pickRandomFireTime(
  baseDate: Date,
  mainHHMMs: string[]
): Date | null {
  const mainAsMinutes = mainHHMMs
    .map((hhmm) => {
      const [h, m] = hhmm.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    })
    .filter((v): v is number => v !== null);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const hour =
      RANDOM_WINDOW_START_HOUR +
      Math.floor(
        Math.random() *
          (RANDOM_WINDOW_END_HOUR - RANDOM_WINDOW_START_HOUR)
      );
    const minute = Math.floor(Math.random() * 60);
    const candidate = hour * 60 + minute;
    const conflicts = mainAsMinutes.some(
      (main) => Math.abs(candidate - main) < RANDOM_BUFFER_MINUTES
    );
    if (conflicts) continue;
    const out = new Date(baseDate);
    out.setHours(hour, minute, 0, 0);
    return out;
  }
  return null;
}

export async function cancelAllRandomNudges(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((s) => s.identifier.startsWith(RANDOM_ID_PREFIX))
      .map((s) =>
        Notifications.cancelScheduledNotificationAsync(s.identifier)
      )
  );
}

/**
 * Top-up only. Used by the boot self-heal — adds DATE triggers for any
 * day in the next 7 that doesn't already have one. Never re-rolls
 * existing future triggers (so the user doesn't watch their random
 * times shift around every time they foreground the app).
 *
 * If `activeWeekdays` is empty, returns `disabled` without touching
 * existing triggers. The boot path should never reach this state
 * because it pre-checks master + reminder count, but defensive here.
 */
export async function topUpRandomNudges(
  input: RandomNudgeScheduleInput
): Promise<RandomNudgeOutcome> {
  if (input.activeWeekdays.length === 0) {
    return { kind: "disabled" };
  }
  const status = await getPermissionStatus();
  if (status !== "granted") {
    return { kind: "permission-denied" };
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existing = new Set<string>(
    scheduled
      .filter((s) => s.identifier.startsWith(RANDOM_ID_PREFIX))
      .map((s) => s.identifier.slice(RANDOM_ID_PREFIX.length))
  );

  const added = await fillMissingRandoms(
    existing,
    input.activeWeekdays,
    input.mainTimes
  );
  return { kind: "scheduled", count: added };
}

/**
 * Reconcile mode. Used by save paths (onboarding step 9, settings
 * reminders.tsx). Prunes existing random triggers that no longer
 * satisfy the user's current weekday set, then tops up missing days.
 * Existing valid triggers are preserved — no unnecessary re-roll.
 *
 * Pass `activeWeekdays: []` (or use cancelAllRandomNudges directly)
 * when the user disables reminders entirely.
 */
export async function syncRandomNudges(
  input: RandomNudgeScheduleInput
): Promise<RandomNudgeOutcome> {
  if (input.activeWeekdays.length === 0) {
    await cancelAllRandomNudges();
    return { kind: "disabled" };
  }
  const status = await getPermissionStatus();
  if (status !== "granted") {
    return { kind: "permission-denied" };
  }

  // Prune triggers whose weekday is no longer active OR whose calendar
  // date is more than 1 day in the past. (Past-date DATE triggers
  // don't fire and don't hurt much; iOS cleans them up, but we
  // explicitly remove old ones for tidiness on every save.)
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const validDates = new Set<string>();
  for (const s of scheduled) {
    if (!s.identifier.startsWith(RANDOM_ID_PREFIX)) continue;
    const dateKey = s.identifier.slice(RANDOM_ID_PREFIX.length);
    const parsed = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      await Notifications.cancelScheduledNotificationAsync(s.identifier);
      continue;
    }
    if (parsed.getTime() < yesterday.getTime()) {
      await Notifications.cancelScheduledNotificationAsync(s.identifier);
      continue;
    }
    if (!input.activeWeekdays.includes(parsed.getDay())) {
      await Notifications.cancelScheduledNotificationAsync(s.identifier);
      continue;
    }
    validDates.add(dateKey);
  }

  const added = await fillMissingRandoms(
    validDates,
    input.activeWeekdays,
    input.mainTimes
  );
  return { kind: "scheduled", count: validDates.size + added };
}

/**
 * Shared filler used by both `syncRandomNudges` and `topUpRandomNudges`.
 * Walks the next 7 calendar days, scheduling a DATE trigger for each
 * active weekday that isn't already in `existing`. Returns the count
 * actually added.
 */
async function fillMissingRandoms(
  existing: Set<string>,
  activeWeekdays: number[],
  mainTimes: string[]
): Promise<number> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let added = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const target = new Date(today);
    target.setDate(today.getDate() + offset);
    const weekday = target.getDay();
    if (!activeWeekdays.includes(weekday)) continue;
    const dateKey = ymd(target);
    if (existing.has(dateKey)) continue;

    const fireAt = pickRandomFireTime(target, mainTimes);
    if (!fireAt) continue;
    // Don't schedule for a moment that's already in the past — e.g.
    // user opens the app at 5pm and today's window is 10am–6pm; the
    // re-roll might pick 11am, which is moot.
    if (fireAt.getTime() <= now.getTime()) continue;

    const body =
      RANDOM_BODY_VARIATIONS[
        Math.abs(weekday * 7 + offset) % RANDOM_BODY_VARIATIONS.length
      ];
    await Notifications.scheduleNotificationAsync({
      identifier: `${RANDOM_ID_PREFIX}${dateKey}`,
      content: {
        title: "Acuity",
        body,
        sound: "default",
        data: { deepLink: "acuity://", random: true },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
    added += 1;
  }
  return added;
}
