import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import {
  boundedText,
  boundedTextOrNull,
  DESCRIPTION_MAX,
  NOTES_MAX,
  TITLE_MAX,
  TextBoundsError,
} from "@/lib/text-bounds";

export const dynamic = "force-dynamic";

function tooLong(err: TextBoundsError): NextResponse {
  return NextResponse.json(
    { error: "TooLong", field: err.field, limit: err.limit },
    { status: 400 }
  );
}

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  // Explicit select — drop progressNotes (Json[]), entryRefs (String[]),
  // notes (text), treePath (string), depth, editedByUser, parentGoalId.
  // The list/board UI consumes only the surfaced fields. /api/goals/[id]
  // returns the full row for detail views. Saves ~5-50KB per goal on
  // accounts with detailed progress notes; bigger reduction for power
  // users with deep histories.
  const goals = await prisma.goal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      lifeArea: true,
      status: true,
      progress: true,
      targetDate: true,
      lastMentionedAt: true,
      createdAt: true,
    },
  });

  // Per-user 30s cache. Goals change rarely mid-session; mutations
  // (POST/PATCH/DELETE) call router.refresh() on the client to bust
  // the cache entry immediately. 30s is short enough that an out-of-
  // band change (Inngest extraction creating a new goal) shows up
  // within reasonable bounds.
  return NextResponse.json(
    { goals },
    { headers: { "Cache-Control": "private, max-age=30" } }
  );
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body?.title) {
    return NextResponse.json(
      { error: "Missing required field: title" },
      { status: 400 }
    );
  }

  let title: string;
  let description: string | null;
  try {
    title = boundedText(body.title, "title", TITLE_MAX);
    description = boundedTextOrNull(
      body.description,
      "description",
      DESCRIPTION_MAX
    );
  } catch (err) {
    if (err instanceof TextBoundsError) return tooLong(err);
    throw err;
  }
  if (!title) {
    return NextResponse.json(
      { error: "Missing required field: title" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  const goal = await prisma.goal.create({
    data: {
      userId,
      title,
      description,
      targetDate: body.targetDate ? new Date(body.targetDate) : null,
      lifeArea: body.lifeArea ?? "PERSONAL",
      // Manually-created goals are user-authored from the first keystroke,
      // so they're immune to extraction overwrites from day one.
      editedByUser: true,
    },
  });

  return NextResponse.json({ goal }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body?.id || !body?.action) {
    return NextResponse.json(
      { error: "Missing required fields: id, action" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.goal.findFirst({
    where: { id: body.id, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  let data: Record<string, unknown>;

  switch (body.action) {
    case "complete":
      data = { status: "COMPLETE", progress: 100, editedByUser: true };
      break;
    case "pause":
      data = { status: "ON_HOLD", editedByUser: true };
      break;
    case "resume":
      data = { status: "IN_PROGRESS", editedByUser: true };
      break;
    case "start":
      data = { status: "IN_PROGRESS", editedByUser: true };
      break;
    case "archive":
      // Archive is a distinct state again (2026-04-22). Hides the goal
      // from the main tree + excludes it from recommended-activity picks.
      // "Restore" re-surfaces by flipping back to IN_PROGRESS.
      data = { status: "ARCHIVED", editedByUser: true };
      break;
    case "restore":
      // Undo of archive — sends the goal back to IN_PROGRESS.
      data = { status: "IN_PROGRESS", editedByUser: true };
      break;
    case "progress":
      if (typeof body.progress !== "number" || body.progress < 0 || body.progress > 100) {
        return NextResponse.json(
          { error: "progress must be a number 0-100" },
          { status: 400 }
        );
      }
      data = { progress: body.progress, editedByUser: true };
      break;
    case "edit": {
      // Field-level edit from the goal detail view. Accepts any subset of
      // { title, description, notes, status, progress, targetDate, lifeArea }.
      // Validates status against the 4-value vocab and progress as 0..100.
      const fields = body.fields as Record<string, unknown> | undefined;
      if (!fields || typeof fields !== "object") {
        return NextResponse.json({ error: "Missing fields object" }, { status: 400 });
      }
      const VALID_STATUS = [
        "NOT_STARTED",
        "IN_PROGRESS",
        "ON_HOLD",
        "COMPLETE",
        "ARCHIVED",
      ];
      const update: Record<string, unknown> = { editedByUser: true };
      try {
        if (typeof fields.title === "string") {
          update.title = boundedText(fields.title, "title", TITLE_MAX);
        }
        if (typeof fields.description === "string" || fields.description === null) {
          update.description = boundedTextOrNull(
            fields.description,
            "description",
            DESCRIPTION_MAX
          );
        }
        if (typeof fields.notes === "string" || fields.notes === null) {
          update.notes = boundedTextOrNull(fields.notes, "notes", NOTES_MAX);
        }
      } catch (err) {
        if (err instanceof TextBoundsError) return tooLong(err);
        throw err;
      }
      if (typeof fields.status === "string") {
        if (!VALID_STATUS.includes(fields.status)) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        update.status = fields.status;
        if (fields.status === "COMPLETE") update.progress = 100;
      }
      if (typeof fields.progress === "number") {
        if (fields.progress < 0 || fields.progress > 100) {
          return NextResponse.json({ error: "progress 0-100" }, { status: 400 });
        }
        update.progress = fields.progress;
      }
      if (typeof fields.targetDate === "string" || fields.targetDate === null) {
        update.targetDate = fields.targetDate ? new Date(fields.targetDate as string) : null;
      }
      if (typeof fields.lifeArea === "string") update.lifeArea = fields.lifeArea;
      data = update;
      break;
    }
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const goal = await prisma.goal.update({
    where: { id: body.id },
    data,
  });

  return NextResponse.json({ goal });
}
