/**
 * GET /api/goals/[id] — returns the goal + first-mention date + up to 20
 * linked entries (entries whose extraction referenced this goal title).
 *
 * Linked-entry discovery: the extraction pipeline stores entry-level goal
 * refs in Goal.entryRefs (array of Entry IDs). We fetch those entries and
 * return a trimmed projection — summary, createdAt, mood, themes — enough
 * for the detail view's "Linked entries" list without pulling transcripts.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const goal = await prisma.goal.findFirst({
    where: { id: params.id, userId },
  });
  if (!goal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Linked entries come from TWO sources, unioned:
  //   1. Entry.goalId — explicit link set when the user tapped
  //      "Record about this goal" and the recorder forwarded goalId.
  //   2. Goal.entryRefs — legacy fuzzy match written by the extraction
  //      pipeline when a transcript references an existing goal by title.
  // Dedup is implicit via Prisma OR + id; sorted newest-first, cap at 20.
  const refs = Array.isArray(goal.entryRefs) ? goal.entryRefs.slice(0, 20) : [];
  const linkedEntries = await prisma.entry.findMany({
    where: {
      userId,
      OR: [
        { goalId: goal.id },
        ...(refs.length > 0 ? [{ id: { in: refs } }] : []),
      ],
    },
    select: {
      id: true,
      summary: true,
      createdAt: true,
      mood: true,
      themes: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ goal, linkedEntries });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const { prisma } = await import("@/lib/prisma");
  const existing = await prisma.goal.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.goal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
