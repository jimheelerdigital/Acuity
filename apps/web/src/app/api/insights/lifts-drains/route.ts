/**
 * GET /api/insights/lifts-drains (2026-10-27)
 *
 * "What lifts you, what drains you": day-level mood compared across
 * themes, people, habits and (when connected) calendar load. All the
 * logic and the minimum-data rules live in lib/lifts-drains.ts; row
 * loading is shared with the web /insights page (lib/insights-reports-data).
 *
 * Pro (PRO + active trial), same entitlement as the other personal
 * analysis surfaces. Returns { lifts: [], drains: [] } when there isn't
 * enough data, and the card renders nothing.
 */
import { NextRequest, NextResponse } from "next/server";

import { loadLiftsDrains } from "@/lib/insights-reports-data";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const proGate = await requireEntitlement("canExtractEntries", userId);
  if (!proGate.ok) return proGate.response;

  const { prisma } = await import("@/lib/prisma");
  const result = await loadLiftsDrains(prisma, userId);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=1800" },
  });
}
