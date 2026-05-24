/**
 * POST /api/calendar/sync
 *
 * On-demand Google Calendar refresh. Used by the /account "Sync now"
 * link in slice 4 and by the post-connect callback flow.
 *
 * Synchronous: the user is staring at a loading spinner, so we
 * actually wait for the sync to complete (typically < 5s for a
 * normal calendar). Returns counts so the UI can show "Synced N
 * events" inline.
 *
 * Rate limit: 1 manual sync per minute per user. The daily cron
 * handles the routine path; this endpoint is for "I just connected"
 * or "I just added a new meeting and want to record about it now".
 */

import { NextRequest, NextResponse } from "next/server";

import { syncCalendarEventsForUser } from "@/lib/calendar/sync";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { checkRateLimit, limiters } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limiter = limiters.calendarSync;
  if (limiter) {
    const check = await checkRateLimit(limiter, `user:${userId}`);
    if (!check.success) {
      return NextResponse.json(
        { ok: false, error: "RateLimited" },
        { status: 429 }
      );
    }
  }

  const result = await syncCalendarEventsForUser(userId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.errorMessage ?? "SyncFailed" },
      { status: result.errorMessage === "NotConnected" ? 400 : 502 }
    );
  }
  return NextResponse.json({
    ok: true,
    eventsUpserted: result.eventsUpserted,
  });
}
