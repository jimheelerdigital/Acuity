/**
 * POST /api/user/auto-lock
 *
 * Mirrors the device's selected auto-lock interval into User.autoLockMinutes
 * so the preference survives reinstall and follows the user across
 * devices via the next /api/user/me fetch.
 *
 * Body shape:
 *   { minutes: 0 | 1 | 2 | 5 | 15 | -1 }
 *
 * Encoding (matches apps/mobile/lib/app-lock.ts):
 *   0  → lock immediately on background
 *   1  → 1 minute
 *   2  → 2 minutes (default — banking-app norm)
 *   5  → 5 minutes
 *   15 → 15 minutes
 *  -1  → never re-lock on resume; only cold-launch re-locks
 *
 * AsyncStorage on the device is the authoritative source for the
 * lock-context's synchronous read on AppState change. This endpoint
 * is for cross-device durability — the client writes locally first
 * and fires this call afterwards, so a network failure here doesn't
 * block the user-visible UX.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_MINUTES = new Set([0, 1, 2, 5, 15, -1]);

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    minutes?: unknown;
  } | null;

  const raw = body?.minutes;
  const minutes =
    typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : NaN;

  if (!VALID_MINUTES.has(minutes)) {
    return NextResponse.json(
      { error: "InvalidMinutes" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({
    where: { id: userId },
    data: { autoLockMinutes: minutes },
  });

  return NextResponse.json({ ok: true, minutes });
}
