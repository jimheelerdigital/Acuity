/**
 * GET /api/user/progression
 *
 * Returns the current user's UserProgression. The single source of
 * truth for every guided-experience surface (focus card, tip bubbles,
 * locked-feature empty states, streak UI).
 *
 * Auth: cookie session or mobile bearer, via getAnySessionUserId.
 * Cache: 60s per-user via Cache-Control. Progression doesn't change
 * minute-to-minute; a fresh recording just means the next poll will
 * pick up the new state within a minute. The snapshot write inside
 * getUserProgression is the persistence path for `recentlyUnlocked`
 * — short cache is fine because the diff is stored in the DB.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { getUserProgression } from "@/lib/userProgression";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const progression = await getUserProgression(userId);
    // no-store so the browser HTTP cache doesn't sit on top of Next's
    // Router Cache and double-stale the counter after a fresh record.
    // Compute is cheap (~5ms on a warm user) and happens server-side
    // anyway; letting every request recompute keeps the locked-state
    // counters live-accurate.
    return NextResponse.json(progression, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/user/progression]", err);
    return NextResponse.json(
      { error: "ProgressionError" },
      { status: 500 }
    );
  }
}
