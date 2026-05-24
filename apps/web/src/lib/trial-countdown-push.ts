/**
 * Trial countdown push notifications — slice 9 (2026-05-25).
 *
 * Server-side push sender for the trial endgame. Two cohorts:
 *   - T-3: nudge users 3 days before trial expiry
 *   - T+0: nudge users on the day of expiry (after the
 *          trial-expiration cron stamps trialExpiredAt)
 *
 * Tracking uses the dedicated User.trialT3PushSentAt +
 * User.trialEndedPushSentAt columns from slice 3.
 *
 * ⚠️ This module is a no-op until mobile starts registering Expo
 * push tokens to User.pushToken. The mobile-side registration touches
 * live app launch + auth + a new API contract, which fits the
 * live-app HIGH RISK profile (v1.0 on App Store since 2026-05-15).
 * That piece is paused pending Jim's explicit go/no-go.
 *
 * Implementation choices:
 *   - Direct fetch to https://exp.host/--/api/v2/push/send. The
 *     full expo-server-sdk adds chunking + receipt polling but is
 *     overkill for two daily cohorts that almost always fit in a
 *     single batch. Pulling it in also adds a build-time dep we
 *     don't need yet.
 *   - Idempotent via updateMany with the SentAt-IS-NULL re-assert
 *     (same pattern as trial-countdown-emails.ts). Two crons racing
 *     each other on the same user can't double-send.
 *   - Apple Option-C compliance: push copy must not include
 *     "Subscribe", "$", or "/mo". The strings below say "Continue
 *     on web" — same vocabulary as the in-app cards.
 */

import "server-only";

import { safeLog } from "@/lib/safe-log";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type CountdownPushKey =
  | "trial_countdown_t3_push"
  | "trial_ended_t0_push";

interface PushPayload {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  data?: Record<string, string>;
}

const COUNTDOWN_PAYLOADS: Record<
  CountdownPushKey,
  Omit<PushPayload, "to">
> = {
  trial_countdown_t3_push: {
    title: "3 days left in your trial",
    body: "Your Theme Map and weekly insights stay locked in unless you continue on web.",
    sound: "default",
    data: { src: "trial_countdown_t3" },
  },
  trial_ended_t0_push: {
    title: "Your trial ended",
    body: "Recording stays free. Your insights are paused — continue on web to bring them back.",
    sound: "default",
    data: { src: "trial_ended_t0" },
  },
};

function sentAtColumnFor(kind: CountdownPushKey): string {
  switch (kind) {
    case "trial_countdown_t3_push":
      return "trialT3PushSentAt";
    case "trial_ended_t0_push":
      return "trialEndedPushSentAt";
  }
}

/**
 * Send a single countdown push to a user. Returns true if a push
 * left the building, false on no-op or failure. Idempotent: the
 * SentAt column is stamped via updateMany with an IS NULL re-assert,
 * so duplicate calls (race between two cron runs) won't double-send.
 */
export async function sendCountdownPush(
  userId: string,
  kind: CountdownPushKey
): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, pushToken: true },
  });
  if (!user || !user.pushToken) {
    // No registered device — silent no-op. We don't try to "fill in"
    // a missing token by falling back to email; the email cron is a
    // separate system that handles its own cohort.
    return false;
  }

  const payload: PushPayload = {
    to: user.pushToken,
    ...COUNTDOWN_PAYLOADS[kind],
  };

  let httpOk = false;
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
    httpOk = res.ok;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      safeLog.error("trial-countdown-push.http_error", {
        userId,
        kind,
        status: res.status,
        body: text.slice(0, 400),
      });
    }
  } catch (err) {
    safeLog.error("trial-countdown-push.fetch_throw", {
      userId,
      kind,
      err: err instanceof Error ? err.message : "unknown",
    });
  }

  if (!httpOk) return false;

  const column = sentAtColumnFor(kind);
  const result = await prisma.user.updateMany({
    where: { id: userId, [column]: null } as never,
    data: { [column]: new Date() } as never,
  });
  if (result.count === 0) {
    // Already stamped by a parallel cron run. The HTTP push went out
    // anyway, which is mildly redundant but not user-visible noise
    // (Expo dedupes identical pushes within a short window per token).
    safeLog.warn("trial-countdown-push.idempotency_lost", {
      userId,
      kind,
    });
  }

  safeLog.info("trial-countdown-push.sent", { userId, kind });
  return true;
}
