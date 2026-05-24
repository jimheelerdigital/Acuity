/**
 * POST /api/calendar/disconnect
 *
 * Revokes the stored Google Calendar refresh token at Google's
 * endpoint and clears the local columns. Best-effort revocation —
 * if Google's endpoint fails, we still clear locally so the user
 * isn't stuck with a "Connected" state they can't escape.
 *
 * Past `CalendarEvent` rows (slice 2+) are kept intentionally. The
 * user's existing reflections that link to events should stay
 * intact; if they reconnect, we re-sync from the same primary
 * calendar and the event ids will still match.
 */

import { NextRequest, NextResponse } from "next/server";

import { decryptToken } from "@/lib/calendar/encryption";
import { revokeRefreshToken } from "@/lib/calendar/oauth";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleCalendarRefreshToken: true },
  });

  if (user?.googleCalendarRefreshToken) {
    const plaintext = decryptToken(user.googleCalendarRefreshToken);
    if (plaintext) {
      const revoked = await revokeRefreshToken(plaintext);
      if (!revoked) {
        safeLog.warn("calendar.disconnect.revoke_failed", { userId });
      }
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      googleCalendarRefreshToken: null,
      googleCalendarEmail: null,
      googleCalendarConnectedAt: null,
      googleCalendarLastSyncedAt: null,
    },
  });

  safeLog.info("calendar.disconnect.done", { userId });
  return NextResponse.json({ ok: true });
}
