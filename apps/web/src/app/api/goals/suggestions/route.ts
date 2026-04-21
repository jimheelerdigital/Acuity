/**
 * GET  /api/goals/suggestions    — list PENDING suggestions for review
 * POST /api/goals/suggestions    — { action: "accept" | "dismiss" | "edit-accept", id, editedText? }
 *
 * Backs the suggestions banner + review modal. Accept creates a child
 * Goal under parentGoalId (falling through to root if the parent is
 * null). Dismiss marks DISMISSED. Edit-accept rewrites the text and
 * then runs the accept path.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MAX_TREE_DEPTH, computePath } from "@/lib/goals";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const suggestions = await prisma.goalSuggestion.findMany({
    where: { userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      parentGoal: { select: { id: true, title: true, depth: true } },
    },
  });

  // Pull source-entry excerpts so the UI can show "...from your Oct 15
  // entry" without a second round-trip.
  const entryIds = Array.from(
    new Set(suggestions.map((s) => s.sourceEntryId).filter(Boolean))
  ) as string[];
  const entries =
    entryIds.length > 0
      ? await prisma.entry.findMany({
          where: { id: { in: entryIds }, userId },
          select: { id: true, createdAt: true, summary: true, transcript: true },
        })
      : [];
  const entryMap = new Map(entries.map((e) => [e.id, e]));

  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      id: s.id,
      parentGoalId: s.parentGoalId,
      parentGoalTitle: s.parentGoal?.title ?? null,
      suggestedText: s.suggestedText,
      createdAt: s.createdAt.toISOString(),
      source:
        s.sourceEntryId && entryMap.has(s.sourceEntryId)
          ? {
              entryId: s.sourceEntryId,
              createdAt: entryMap.get(s.sourceEntryId)!.createdAt.toISOString(),
              excerpt: (() => {
                const e = entryMap.get(s.sourceEntryId!);
                const raw = e?.summary ?? e?.transcript ?? "";
                return raw.length > 180 ? `${raw.slice(0, 180).trim()}…` : raw;
              })(),
            }
          : null,
    })),
  });
}

const PostBody = z.object({
  id: z.string().min(1),
  action: z.enum(["accept", "dismiss", "edit-accept"]),
  editedText: z.string().min(1).max(200).optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { id, action, editedText } = parsed.data;

  const { prisma } = await import("@/lib/prisma");
  const suggestion = await prisma.goalSuggestion.findFirst({
    where: { id, userId, status: "PENDING" },
    include: {
      parentGoal: {
        select: {
          id: true,
          userId: true,
          treePath: true,
          depth: true,
          lifeArea: true,
        },
      },
    },
  });
  if (!suggestion) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "dismiss") {
    await prisma.goalSuggestion.update({
      where: { id },
      data: { status: "DISMISSED" },
    });
    return NextResponse.json({ ok: true });
  }

  const text = action === "edit-accept" ? editedText : suggestion.suggestedText;
  if (!text) {
    return NextResponse.json(
      { error: "editedText required for edit-accept" },
      { status: 400 }
    );
  }

  const parent = suggestion.parentGoal;

  // Depth check applies only when we have a parent.
  if (parent && parent.depth + 1 > MAX_TREE_DEPTH) {
    return NextResponse.json(
      {
        error: "MaxDepthExceeded",
        detail: `Parent goal already at depth ${parent.depth}.`,
      },
      { status: 400 }
    );
  }

  // Create the child goal, then mark the suggestion accepted. Two-step
  // writes kept sequential so the suggestion row only flips if the
  // goal create succeeded.
  const created = await prisma.goal.create({
    data: {
      userId,
      title: text,
      parentGoalId: parent?.id ?? null,
      lifeArea: parent?.lifeArea ?? "PERSONAL",
      editedByUser: true,
    },
  });

  const { treePath, depth } = computePath(
    created.id,
    parent
      ? {
          id: parent.id,
          treePath: parent.treePath,
          depth: parent.depth,
        }
      : null
  );

  const [goal] = await Promise.all([
    prisma.goal.update({
      where: { id: created.id },
      data: { treePath, depth },
    }),
    prisma.goalSuggestion.update({
      where: { id },
      data: { status: "ACCEPTED" },
    }),
  ]);

  return NextResponse.json({ goal });
}
