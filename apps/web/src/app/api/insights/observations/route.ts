/**
 * GET  /api/insights/observations      — list top 3 non-dismissed
 * POST /api/insights/observations      — { action: "dismiss", id }
 *
 * Backs the auto-flagged observations card at the top of Insights.
 * Ordering: CONCERNING > POSITIVE > NEUTRAL (severity weight), then
 * newest first. Caps at 3 — more than that reads as noise.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEVERITY_WEIGHT: Record<string, number> = {
  CONCERNING: 3,
  POSITIVE: 2,
  NEUTRAL: 1,
};

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.userInsight.findMany({
    where: { userId, dismissedAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  rows.sort(
    (a, b) =>
      (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0) ||
      b.createdAt.getTime() - a.createdAt.getTime()
  );

  return NextResponse.json({
    observations: rows.slice(0, 3).map((r) => ({
      id: r.id,
      observationText: r.observationText,
      severity: r.severity,
      linkedAreaId: r.linkedAreaId,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    action?: string;
    id?: string;
  } | null;
  if (!body || body.action !== "dismiss" || typeof body.id !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const existing = await prisma.userInsight.findFirst({
    where: { id: body.id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.userInsight.update({
    where: { id: body.id },
    data: { dismissedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
