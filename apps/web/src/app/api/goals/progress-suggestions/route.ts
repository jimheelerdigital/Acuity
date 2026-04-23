/**
 * GET  /api/goals/progress-suggestions        — list PENDING progress suggestions (all goals, or one)
 * POST /api/goals/progress-suggestions        — { action: "accept" | "dismiss" | "edit-accept", id, editedPct? }
 *
 * Backs the review banner on the goal detail page. Accept writes the
 * suggested value to Goal.progress + flips the suggestion to ACCEPTED.
 * Dismiss just flips to DISMISSED. Edit-accept uses the user-edited pct
 * instead of the original suggestion.
 *
 * Auth: getAnySessionUserId so web + mobile share this endpoint.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const goalId = url.searchParams.get("goalId");

  const { prisma } = await import("@/lib/prisma");
  const suggestions = await prisma.progressSuggestion.findMany({
    where: {
      userId,
      status: "PENDING",
      ...(goalId ? { goalId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      goal: { select: { id: true, title: true, progress: true } },
    },
  });

  // Source-entry excerpt for "from your Oct 15 entry" deep link.
  const entryIds = Array.from(
    new Set(suggestions.map((s) => s.sourceEntryId).filter(Boolean))
  ) as string[];
  const entries =
    entryIds.length > 0
      ? await prisma.entry.findMany({
          where: { id: { in: entryIds }, userId },
          select: { id: true, createdAt: true, summary: true },
        })
      : [];
  const entryMap = new Map(entries.map((e) => [e.id, e]));

  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      id: s.id,
      goalId: s.goalId,
      goalTitle: s.goal?.title ?? null,
      currentProgressPct: s.goal?.progress ?? s.priorProgressPct,
      priorProgressPct: s.priorProgressPct,
      suggestedProgressPct: s.suggestedProgressPct,
      rationale: s.rationale,
      sourceEntryId: s.sourceEntryId,
      sourceEntrySummary: s.sourceEntryId
        ? entryMap.get(s.sourceEntryId)?.summary ?? null
        : null,
      sourceEntryAt: s.sourceEntryId
        ? entryMap.get(s.sourceEntryId)?.createdAt.toISOString() ?? null
        : null,
      createdAt: s.createdAt.toISOString(),
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
    action?: unknown;
    id?: unknown;
    editedPct?: unknown;
  } | null;

  if (
    !body ||
    typeof body.action !== "string" ||
    typeof body.id !== "string"
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  const suggestion = await prisma.progressSuggestion.findFirst({
    where: { id: body.id, userId, status: "PENDING" },
  });
  if (!suggestion) {
    return NextResponse.json(
      { error: "Not found or already resolved" },
      { status: 404 }
    );
  }

  if (body.action === "dismiss") {
    await prisma.progressSuggestion.update({
      where: { id: suggestion.id },
      data: { status: "DISMISSED" },
    });
    return NextResponse.json({ ok: true });
  }

  // accept / edit-accept both write to Goal.progress.
  let targetPct = suggestion.suggestedProgressPct;
  if (body.action === "edit-accept") {
    const edited = Number(body.editedPct);
    if (!Number.isFinite(edited) || edited < 0 || edited > 100) {
      return NextResponse.json(
        { error: "editedPct must be 0-100" },
        { status: 400 }
      );
    }
    targetPct = Math.round(edited);
  } else if (body.action !== "accept") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.goal.update({
      where: { id: suggestion.goalId },
      data: {
        progress: targetPct,
        // Any manual edit via accept marks the goal as user-edited so
        // the extraction pipeline won't auto-overwrite fields later.
        editedByUser: true,
      },
    });
    await tx.progressSuggestion.update({
      where: { id: suggestion.id },
      data: { status: "ACCEPTED" },
    });
    // Auto-dismiss any other PENDING progress suggestions on the same
    // goal — they're now obsolete relative to the new progress value.
    await tx.progressSuggestion.updateMany({
      where: {
        userId,
        goalId: suggestion.goalId,
        status: "PENDING",
        id: { not: suggestion.id },
      },
      data: { status: "DISMISSED" },
    });
  });

  return NextResponse.json({ ok: true, goalProgress: targetPct });
}
