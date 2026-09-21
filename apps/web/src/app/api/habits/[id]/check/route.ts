import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

/**
 * Check / uncheck a habit for one LOCAL calendar day.
 *
 * The date comes from the CLIENT, because the server does not reliably know
 * the user's local day: a check at 11pm in Sydney belongs to that Sydney
 * date, not to whatever date it happens to be in UTC. The value is
 * validated and bounded rather than trusted — see below.
 */

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isFlagOn(): boolean {
  return process.env.ENABLE_HABITS === "1";
}

/**
 * Reject a date that isn't within a day of "now" in any real timezone.
 *
 * Without this a client could backfill an arbitrary streak. ±1 day covers
 * every UTC offset (-12 to +14) while still refusing 2019.
 */
function isPlausibleLocalDate(localDate: string, now: Date): boolean {
  if (!DATE_RE.test(localDate)) return false;
  const asUtc = Date.parse(`${localDate}T00:00:00.000Z`);
  if (Number.isNaN(asUtc)) return false;
  const deltaHours = Math.abs(asUtc - now.getTime()) / (60 * 60 * 1000);
  return deltaHours <= 38;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    localDate?: unknown;
    checked?: unknown;
  } | null;

  const localDate =
    typeof body?.localDate === "string" ? body.localDate.trim() : "";
  if (!isPlausibleLocalDate(localDate, new Date())) {
    return NextResponse.json(
      { error: "localDate must be today's date in YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  // Ownership check. Without it, a caller could check off another user's
  // habit by id — the unique constraint is on (habitId, localDate), which
  // says nothing about who owns the habit.
  const owned = await prisma.habit.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const checked = body?.checked !== false; // default true

  if (!checked) {
    await prisma.habitCheck.deleteMany({ where: { habitId: id, localDate } });
    return NextResponse.json({ ok: true, checked: false });
  }

  // Idempotent: the (habitId, localDate) unique constraint makes a
  // double-tap a no-op at the database level rather than relying on the
  // client to debounce.
  await prisma.habitCheck.upsert({
    where: { habitId_localDate: { habitId: id, localDate } },
    create: { habitId: id, userId, localDate },
    update: {},
  });

  return NextResponse.json({ ok: true, checked: true });
}
