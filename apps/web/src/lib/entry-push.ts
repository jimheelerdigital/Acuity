import "server-only";

import { safeLog } from "@/lib/safe-log";

/**
 * Completion / failure push for a processed entry (Phase 2/3, v1.3.3).
 * Reuses the trial-countdown-push Expo POST shape. No-op if the user has no
 * registered pushToken — web + Android-without-FCM fall back to the in-app
 * toast + Entries badge (Phase 1). No idempotency column by design (the
 * no-schema decision): the caller fires once per pipeline run; a manual
 * reprocess re-notifies, which is rare + benign. `data.entryId` drives the
 * mobile tap → /entry/[id] routing.
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type EntryPushKind = "completion" | "failure";

export async function sendEntryPush(params: {
  userId: string;
  entryId: string;
  kind: EntryPushKind;
  title: string;
  body: string;
}): Promise<boolean> {
  const { userId, entryId, kind, title, body } = params;
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true },
  });
  if (!user?.pushToken) return false; // no device → in-app fallback

  const payload = {
    to: user.pushToken,
    title,
    body,
    sound: "default" as const,
    data: { entryId, type: kind, src: `entry_${kind}` },
  };

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
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      safeLog.error("entry-push.http_error", {
        userId,
        entryId,
        kind,
        status: res.status,
        body: text.slice(0, 400),
      });
      return false;
    }
  } catch (err) {
    safeLog.error("entry-push.fetch_throw", {
      userId,
      entryId,
      kind,
      err: err instanceof Error ? err.message : "unknown",
    });
    return false;
  }
  safeLog.info("entry-push.sent", { userId, entryId, kind });
  return true;
}

/** Completion preview body, e.g. "Recorded at 2:34 PM — 4 tasks, 1 goal".
 *  Omits empty segments; falls back to a generic tap prompt. */
export function buildCompletionBody(
  createdAt: Date | null,
  timezone: string | null,
  taskCount: number,
  goalCount: number
): string {
  const parts: string[] = [];
  if (createdAt) {
    try {
      const time = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone || "America/Chicago",
      }).format(createdAt);
      parts.push(`Recorded at ${time}`);
    } catch {
      // invalid timezone string — skip the timestamp segment
    }
  }
  const items: string[] = [];
  if (taskCount > 0) items.push(`${taskCount} task${taskCount === 1 ? "" : "s"}`);
  if (goalCount > 0) items.push(`${goalCount} goal${goalCount === 1 ? "" : "s"}`);
  if (items.length > 0) parts.push(items.join(", "));
  return parts.join(" — ") || "Tap to see what we found.";
}
