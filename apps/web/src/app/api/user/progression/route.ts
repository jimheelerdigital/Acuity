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
    // Short private cache + stale-while-revalidate: two tab
    // navigations within 30s render instantly from cache, third tab
    // hits the DB. Snapshot diff remains accurate because the
    // server-side snapshot write inside getUserProgression always
    // runs on cache miss; a stale hit is just the last-known state
    // that the client has already seen. The record-complete flow
    // hard-refreshes via router.refresh() which bypasses this
    // cache, so locked-state counters stay live-accurate after a
    // new entry lands.
    return NextResponse.json(progression, {
      headers: {
        "Cache-Control":
          "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[api/user/progression]", err);
    return NextResponse.json(
      { error: "ProgressionError" },
      { status: 500 }
    );
  }
}
