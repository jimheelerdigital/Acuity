/**
 * POST /api/account/email-preferences
 *
 * Body: { weeklyEmailEnabled?: boolean, monthlyEmailEnabled?: boolean }
 *
 * Flips the subscribed-to-digest flags. Auth: cookie or Bearer.
 * Rate-limited under the shared userWrite budget.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    weeklyEmailEnabled?: unknown;
    monthlyEmailEnabled?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.weeklyEmailEnabled === "boolean") {
    update.weeklyEmailEnabled = body.weeklyEmailEnabled;
  }
  if (typeof body.monthlyEmailEnabled === "boolean") {
    update.monthlyEmailEnabled = body.monthlyEmailEnabled;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.update({
    where: { id: userId },
    data: update,
    select: {
      weeklyEmailEnabled: true,
      monthlyEmailEnabled: true,
    },
  });

  return NextResponse.json({ ok: true, user });
}
