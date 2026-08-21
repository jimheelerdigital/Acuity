import { safeLog } from "@/lib/safe-log";

/**
 * v10 Day-2 nudge (spec §9 Screen 9).
 *
 * ── One, ever ────────────────────────────────────────────────────────
 * The spec says "One only", and that is load-bearing rather than a
 * nice-to-have. This audience is people already carrying too much; a
 * recurring "you haven't recorded" nudge is indistinguishable from another
 * obligation, and the reminder copy on Screen 8 explicitly promises "no
 * guilt, no streaks". Idempotency lives in a dedicated column so a cron
 * retry or two overlapping runs cannot turn one nudge into two.
 *
 * ── It respects the slot they chose ──────────────────────────────────
 * Screen 8 asked when they want to think out loud. Firing at a fixed hour
 * would ignore the only scheduling preference we have ever asked them for.
 * Falls back to 17:30 local when no slot was set.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Copy is fixed, not templated.
 *
 * No name interpolation and no reference to what they recorded: at Day 2 we
 * would be quoting a single debrief back at someone who may have said
 * something raw, on a lock screen other people can see.
 */
export const DAY2_PUSH = {
  title: "Anything still taking up space?",
  body: "Say it once. Ripple will keep track.",
} as const;

/** Default local time when the user set no reminder slot. */
export const DAY2_DEFAULT_LOCAL_TIME = "17:30";

/**
 * Is `now` within the send window for a user in `timezone` whose target
 * local time is `localTime`?
 *
 * The cron runs hourly, so the window is the hour containing the target.
 * Pure and exported for tests — timezone arithmetic is exactly the kind of
 * thing that looks right and is wrong in July.
 */
export function isWithinLocalHour(
  now: Date,
  timezone: string,
  localTime: string
): boolean {
  const [targetHour] = localTime.split(":").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(targetHour)) return false;

  let localHour: number;
  try {
    localHour = Number.parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        hour12: false,
      }).format(now),
      10
    );
  } catch {
    // Unknown/garbage timezone: skip rather than guess. Sending at the
    // wrong hour is worse than not sending — a 3am push from a
    // reflection app is a reason to disable notifications entirely.
    return false;
  }

  return localHour === targetHour;
}

/** Day-2 window: created between 2 and 3 days ago. */
export function isDay2Cohort(createdAt: Date, now: Date): boolean {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const age = now.getTime() - createdAt.getTime();
  return age >= 2 * ONE_DAY && age < 3 * ONE_DAY;
}

/**
 * Send the Day-2 nudge. Returns true only if a push actually left.
 *
 * The SentAt stamp is written with an IS NULL re-assert so a race between
 * two cron runs resolves to exactly one send.
 */
export async function sendDay2Push(userId: string): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");

  // Claim the send FIRST. If two runs race, only one updateMany matches.
  const claimed = await prisma.user.updateMany({
    where: { id: userId, v10Day2PushSentAt: null },
    data: { v10Day2PushSentAt: new Date() },
  });
  if (claimed.count === 0) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true },
  });
  if (!user?.pushToken) {
    // No device. The claim stays stamped on purpose: this user has passed
    // through the Day-2 window, and un-stamping would make them eligible
    // again tomorrow, which is how "one only" quietly becomes "every day
    // until they register a device".
    return false;
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify({
        to: user.pushToken,
        title: DAY2_PUSH.title,
        body: DAY2_PUSH.body,
        sound: "default",
        data: { src: "v10_day2" },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      safeLog.error("v10-day2-push.http_error", {
        userId,
        status: res.status,
        body: text.slice(0, 400),
      });
      return false;
    }
    return true;
  } catch (err) {
    safeLog.error("v10-day2-push.fetch_throw", {
      userId,
      err: err instanceof Error ? err.message : "unknown",
    });
    return false;
  }
}
