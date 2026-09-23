/**
 * Reminder dispatcher — server-owned reminders (2026-09-22).
 *
 * REPLACES the old twice-daily 9am/8pm hardcoded push. The server is now the
 * single reminder engine (the on-device expo-notifications scheduler is retired
 * in the 1.6 app). Runs every REMINDER_TICK_MINUTES; for each opted-in user on
 * app >= 1.6 it fires the reminders that are DUE in this tick, at the time the
 * user actually picked.
 *
 * Why the id stays "notifications-twice-daily": keeping the inngest function id
 * updates the existing cron registration in place instead of orphaning it. The
 * name + schedule + behavior are new.
 *
 * Ownership / no double-send: gated by serverOwnsReminders(appVersion). Users on
 * an older build still schedule locally on-device, so the server must NOT also
 * send — the gate fails closed on unknown/old versions.
 *
 * Idempotency: each UserReminder carries lastFiredLocalDate; we skip a reminder
 * already fired today (user-local) and stamp it after a successful send, so a
 * cron retry or overlapping run can't double-send.
 *
 * Skip-if-done (a server-only win the on-device scheduler couldn't do):
 *   - debrief reminder → skip if the user already recorded an entry today.
 *   - habit nudge      → skip if that habit is already checked off today.
 *
 * Quiet hours are intentionally NOT applied to user-scheduled reminders: the
 * user chose that time deliberately. Quiet hours gate server-INITIATED nudges
 * (surprise check-in, streak/goal engagement) — a later slice.
 */

import {
  DEFAULT_ENABLED_CATEGORIES,
  REMINDER_TICK_MINUTES,
  categoryForReminderKind,
  floorToTick,
  isCategoryEnabled,
  isReminderDueOnTick,
  serverOwnsReminders,
  type NotificationTone,
} from "@acuity/shared";

import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// ─── Copy (tone-aware). Jim owns final wording; these are sane defaults. ─────
// Debrief pools split by time-of-day so a 7am reminder doesn't say "how was
// today". Habit copy names the habit the user committed to. No streak-debt
// framing, no "$"/IAP language (Apple Option-C).
type Copy = { title: string; body: string };

const DEBRIEF_CARING: Record<"morning" | "midday" | "evening", Copy[]> = {
  morning: [
    { title: "Good morning", body: "What do you want to be clear on today?" },
    { title: "Quick debrief", body: "Set the tone with one quick voice note." },
    { title: "Morning check-in", body: "What's on your mind before the day starts?" },
  ],
  midday: [
    { title: "Quick check-in", body: "What's surfacing right now?" },
    { title: "Pause for a minute", body: "How's the day actually going?" },
    { title: "Midday", body: "Get it off your chest — one quick debrief." },
  ],
  evening: [
    { title: "Wind down", body: "How did today actually go?" },
    { title: "Today, in your words", body: "Say it out loud. You'll feel lighter." },
    { title: "End of day", body: "What deserves a name before you sleep?" },
  ],
};

const DEBRIEF_DIRECT: Record<"morning" | "midday" | "evening", Copy[]> = {
  morning: [
    { title: "Morning note", body: "One voice note to start the day." },
    { title: "Check in", body: "What matters today?" },
  ],
  midday: [
    { title: "Check in", body: "Quick entry — what's going on?" },
    { title: "Midday note", body: "Sixty seconds. Go." },
  ],
  evening: [
    { title: "Evening note", body: "Close the day. One entry." },
    { title: "Recap", body: "How did today go?" },
  ],
};

const HABIT_CARING: ((name: string) => Copy)[] = [
  (name) => ({ title: name, body: "Still time today — whenever it fits." }),
  (name) => ({ title: "A gentle nudge", body: `${name}, if now works.` }),
];

const HABIT_DIRECT: ((name: string) => Copy)[] = [
  (name) => ({ title: name, body: "Time for this one." }),
  (name) => ({ title: name, body: "Do it now?" }),
];

function timeBand(bucketStartMin: number): "morning" | "midday" | "evening" {
  const hour = Math.floor(bucketStartMin / 60);
  if (hour < 10) return "morning";
  if (hour < 18) return "midday";
  return "evening";
}

/** Deterministic rotation so copy varies day-to-day without back-to-back repeats. */
function rotate<T>(pool: T[], seed: number): T {
  if (pool.length === 0) return pool[0];
  return pool[Math.abs(seed) % pool.length];
}

function pickDebriefCopy(
  tone: NotificationTone,
  bucketStartMin: number,
  seed: number
): Copy {
  const band = timeBand(bucketStartMin);
  const pool = (tone === "direct" ? DEBRIEF_DIRECT : DEBRIEF_CARING)[band];
  return rotate(pool, seed);
}

function pickHabitCopy(
  tone: NotificationTone,
  habitName: string | null,
  seed: number
): Copy {
  const name = (habitName ?? "").trim() || "your habit";
  const pool = tone === "direct" ? HABIT_DIRECT : HABIT_CARING;
  return rotate(pool, seed)(name);
}

/** User-local {minutes since midnight, weekday 0=Sun, YYYY-MM-DD}. null if tz bad. */
function localParts(
  timezone: string | null,
  now: Date
): { minutes: number; weekday: number; dateISO: string } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const rawHour = Number(get("hour"));
    const minute = Number(get("minute"));
    const y = get("year");
    const m = get("month");
    const d = get("day");
    const wd = get("weekday");
    const wdMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const weekday = wd !== undefined ? wdMap[wd] : undefined;
    if (
      !Number.isFinite(rawHour) ||
      !Number.isFinite(minute) ||
      weekday === undefined ||
      !y || !m || !d
    ) {
      return null;
    }
    // hour12:false can emit "24" at midnight in some ICU builds — normalize.
    const hour = rawHour === 24 ? 0 : rawHour;
    return { minutes: hour * 60 + minute, weekday, dateISO: `${y}-${m}-${d}` };
  } catch {
    return null;
  }
}

interface PushPayload {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  data?: Record<string, string>;
}

async function sendPush(payload: PushPayload): Promise<boolean> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const notificationsTwiceDailyFn = inngest.createFunction(
  {
    id: "notifications-twice-daily",
    name: "Reminders — per-user dispatcher",
    triggers: [{ cron: `*/${REMINDER_TICK_MINUTES} * * * *` }],
    retries: 1,
  },
  async ({ step, logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const now = new Date();

    const candidates = await step.run("load-opted-in-users", async () => {
      return prisma.user.findMany({
        where: { notificationsEnabled: true, pushToken: { not: null } },
        select: {
          id: true,
          pushToken: true,
          timezone: true,
          appVersion: true,
          reminders: {
            where: { enabled: true },
            select: {
              id: true,
              time: true,
              daysActive: true,
              enabled: true,
              kind: true,
              habitId: true,
              lastFiredLocalDate: true,
            },
          },
          notificationPreferences: {
            select: {
              enabledCategories: true,
              tone: true,
              pausedUntil: true,
            },
          },
        },
      });
    });

    const stats = {
      candidates: candidates.length,
      sent: 0,
      skippedOldApp: 0,
      skippedTz: 0,
      skippedPaused: 0,
      skippedCategoryOff: 0,
      skippedAlreadyDone: 0,
      failed: 0,
    };

    const result = await step.run("dispatch-due-reminders", async () => {
      for (const u of candidates) {
        if (!u.pushToken) continue;
        if (!serverOwnsReminders(u.appVersion)) {
          stats.skippedOldApp++;
          continue;
        }
        const prefs = u.notificationPreferences;
        // NB: `candidates` is a step.run() output, so inngest has JSON-round-
        // tripped it — Date fields (pausedUntil) arrive as ISO strings, not
        // Date objects. Parse before comparing.
        if (
          prefs?.pausedUntil &&
          new Date(prefs.pausedUntil).getTime() > now.getTime()
        ) {
          stats.skippedPaused++;
          continue;
        }
        const enabled = prefs?.enabledCategories ?? [...DEFAULT_ENABLED_CATEGORIES];
        const tone: NotificationTone = prefs?.tone === "direct" ? "direct" : "caring";

        const lp = localParts(u.timezone, now);
        if (!lp) {
          stats.skippedTz++;
          continue;
        }
        const bucketStart = floorToTick(lp.minutes);

        const due = u.reminders.filter(
          (r) =>
            isReminderDueOnTick(r, lp.weekday, lp.minutes) &&
            r.lastFiredLocalDate !== lp.dateISO
        );
        if (due.length === 0) continue;

        // Compute "already recorded today" once, lazily, only if a debrief
        // reminder is due (habit reminders don't need it).
        let recordedToday: boolean | null = null;
        const hasRecordedToday = async (): Promise<boolean> => {
          if (recordedToday !== null) return recordedToday;
          const latest = await prisma.entry.findFirst({
            where: { userId: u.id },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          });
          const latestLocal = latest
            ? localParts(u.timezone, latest.createdAt)?.dateISO
            : null;
          recordedToday = latestLocal === lp.dateISO;
          return recordedToday;
        };

        for (const r of due) {
          const kind = r.kind === "habit" ? "habit" : "debrief";
          const category = categoryForReminderKind(kind);
          if (!isCategoryEnabled(enabled, category)) {
            stats.skippedCategoryOff++;
            continue;
          }

          let copy: Copy;
          if (kind === "habit") {
            // Skip a habit nudge if that habit is already done today.
            if (r.habitId) {
              const check = await prisma.habitCheck.findUnique({
                where: {
                  habitId_localDate: { habitId: r.habitId, localDate: lp.dateISO },
                },
                select: { habitId: true },
              });
              if (check) {
                stats.skippedAlreadyDone++;
                continue;
              }
            }
            let habitName: string | null = null;
            if (r.habitId) {
              const h = await prisma.habit.findUnique({
                where: { id: r.habitId },
                select: { name: true, archivedAt: true },
              });
              // Don't nudge for an archived/deleted habit.
              if (!h || h.archivedAt) {
                stats.skippedAlreadyDone++;
                continue;
              }
              habitName = h.name;
            }
            copy = pickHabitCopy(tone, habitName, lp.weekday + bucketStart);
          } else {
            if (await hasRecordedToday()) {
              stats.skippedAlreadyDone++;
              continue;
            }
            copy = pickDebriefCopy(tone, bucketStart, lp.weekday + bucketStart);
          }

          const ok = await sendPush({
            to: u.pushToken,
            title: copy.title,
            body: copy.body,
            sound: "default",
            data: {
              src: kind === "habit" ? "reminder_habit" : "reminder_debrief",
              reminderId: r.id,
              deepLink: kind === "habit" ? "acuity://habits" : "acuity://",
            },
          });

          if (ok) {
            stats.sent++;
            // Stamp AFTER a successful send so a failure retries cleanly.
            await prisma.userReminder.update({
              where: { id: r.id },
              data: { lastFiredLocalDate: lp.dateISO },
            });
          } else {
            stats.failed++;
            safeLog.warn("reminder-dispatch.push-failed", {
              userId: u.id,
              reminderId: r.id,
            });
          }
        }
      }
      return stats;
    });

    logger.info("[reminder-dispatch] sweep complete", result);
    return result;
  }
);
