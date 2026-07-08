/**
 * Twice-daily reminder pushes — v1.3 (2026-06-03).
 *
 * Hourly cron sweep. For each hour UTC, find every opted-in user
 * whose `User.timezone` resolves to local 9 AM or local 8 PM right
 * now, and send a push from a hardcoded rotation pool.
 *
 * This replaces the per-user expo-notifications local scheduling
 * that v1.2 onboarding wrote to AsyncStorage. The local approach
 * required a time picker, a frequency picker, and self-healing on
 * launch (lib/notifications-boot.ts). Backend cron is simpler:
 *
 *   - User toggles "Reminders on" in onboarding or Settings
 *   - We persist User.notificationsEnabled=true and User.timezone
 *   - This cron does the rest. No local schedule, no per-device drift.
 *
 * Copy rotation: 6 morning variants + 6 evening variants. Variant
 * picked by Date().getUTCDate() % pool.length so it cycles steadily
 * across the month without two consecutive days sharing copy.
 *
 * Apple Option-C compliance: copy avoids "Subscribe", "$", "/mo",
 * and any IAP language. The strings are pure ritual / journaling
 * voice, same vocabulary as the rest of the app.
 *
 * Failure mode: per-user errors logged + swallowed. The HTTP push
 * is best-effort — Expo dedupes by-token in a short window, and a
 * missing push doesn't break the user-facing app.
 */

import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MORNING_HOUR = 9;
const EVENING_HOUR = 20;

const MORNING_COPY: ReadonlyArray<{ title: string; body: string }> = [
  { title: "Good morning", body: "What do you want to be clear on today?" },
  { title: "60 seconds", body: "Set the tone. One quick voice note." },
  { title: "Morning check-in", body: "What's on your mind before the day starts?" },
  { title: "Start with intention", body: "Tell Ripple what matters today." },
  { title: "One thing", body: "Name the one thing today is for." },
  { title: "First light", body: "A short note while it's still quiet." },
];

const EVENING_COPY: ReadonlyArray<{ title: string; body: string }> = [
  { title: "Wind down", body: "How did today actually go?" },
  { title: "Evening shutdown", body: "Close the loop. Sixty seconds." },
  { title: "Today, in your words", body: "Before the noise starts again tomorrow." },
  { title: "End of day", body: "What deserves a name before you sleep?" },
  { title: "Quick reflection", body: "Tell Ripple one true thing about today." },
  { title: "Closing ritual", body: "A short voice note. Then rest." },
];

/**
 * Returns the user's current local hour given an IANA timezone.
 * Returns null if the timezone string is malformed (Intl throws).
 */
function localHourFor(timezone: string, now: Date): number | null {
  try {
    // Intl.DateTimeFormat with hour12=false + hour:"2-digit" returns
    // the local hour as a string. Faster than spinning up date-fns-tz
    // for a single number; no extra dep.
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = parts.find((p) => p.type === "hour")?.value;
    if (!h) return null;
    const n = Number(h);
    return Number.isFinite(n) ? n : null;
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
    name: "Reminders — twice-daily push sweep",
    triggers: [{ cron: "0 * * * *" }],
    retries: 1,
  },
  async ({ step, logger }) => {
    const { prisma } = await import("@/lib/prisma");

    // One Date() reference for the whole run so the cron sees a
    // stable "now" — no edge case where a user's hour flips
    // mid-sweep.
    const now = new Date();
    const dayOfMonth = now.getUTCDate();
    const morningVariant = MORNING_COPY[dayOfMonth % MORNING_COPY.length];
    const eveningVariant = EVENING_COPY[dayOfMonth % EVENING_COPY.length];

    const candidates = await step.run("load-opted-in-users", async () => {
      return prisma.user.findMany({
        where: {
          notificationsEnabled: true,
          pushToken: { not: null },
        },
        select: {
          id: true,
          pushToken: true,
          timezone: true,
        },
      });
    });

    let attempted = 0;
    let sent = 0;
    let skippedHour = 0;
    let skippedTz = 0;

    for (const u of candidates) {
      if (!u.pushToken) continue;
      const localHour = localHourFor(u.timezone, now);
      if (localHour === null) {
        skippedTz++;
        continue;
      }
      if (localHour !== MORNING_HOUR && localHour !== EVENING_HOUR) {
        skippedHour++;
        continue;
      }
      const variant =
        localHour === MORNING_HOUR ? morningVariant : eveningVariant;
      attempted++;
      const ok = await sendPush({
        to: u.pushToken,
        title: variant.title,
        body: variant.body,
        sound: "default",
        data: {
          src:
            localHour === MORNING_HOUR
              ? "notifications_morning"
              : "notifications_evening",
        },
      });
      if (ok) sent++;
      else {
        safeLog.warn("notifications-twice-daily.push-failed", {
          userId: u.id,
        });
      }
    }

    logger.info("[notifications-twice-daily] sweep complete", {
      candidates: candidates.length,
      attempted,
      sent,
      skippedHour,
      skippedTz,
    });

    return {
      candidates: candidates.length,
      attempted,
      sent,
      skippedHour,
      skippedTz,
    };
  }
);
