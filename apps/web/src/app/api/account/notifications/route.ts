/**
 * POST /api/account/notifications
 *
 * Update the signed-in user's reminder preferences. Same validation as
 * the onboarding step 9 write, just split into its own route because
 * /account posts outside of the onboarding flow and the onboarding
 * endpoint blocks writes once completedAt is set.
 *
 * Body: {
 *   notificationTime?: "HH:MM",
 *   notificationDays?: number[] (0..6),
 *   notificationsEnabled?: boolean
 * }
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    notificationTime?: unknown;
    notificationDays?: unknown;
    notificationsEnabled?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.notificationTime === "string" && /^\d{2}:\d{2}$/.test(body.notificationTime)) {
    update.notificationTime = body.notificationTime;
  }
  if (Array.isArray(body.notificationDays)) {
    const days = body.notificationDays
      .map((d) => (typeof d === "number" ? Math.round(d) : NaN))
      .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6) as number[];
    update.notificationDays = Array.from(new Set(days)).sort();
  }
  if (typeof body.notificationsEnabled === "boolean") {
    update.notificationsEnabled = body.notificationsEnabled;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.update({
    where: { id: userId },
    data: update,
    select: {
      notificationTime: true,
      notificationDays: true,
      notificationsEnabled: true,
    },
  });

  return NextResponse.json({ ok: true, user });
}
