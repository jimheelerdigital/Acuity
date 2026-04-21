import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const goals = await prisma.goal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ goals });
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

  const { prisma } = await import("@/lib/prisma");

  const goal = await prisma.goal.create({
    data: {
      userId,
      title: body.title,
      description: body.description ?? null,
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
      // "Archive" was a legacy distinct state (ABANDONED) that the new
      // 4-value vocab doesn't have. Collapsed into ON_HOLD — semantically
      // "I'm not pursuing this right now" covers both pause and abandon.
      data = { status: "ON_HOLD", editedByUser: true };
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
      const VALID_STATUS = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETE"];
      const update: Record<string, unknown> = { editedByUser: true };
      if (typeof fields.title === "string") update.title = fields.title.trim();
      if (typeof fields.description === "string" || fields.description === null)
        update.description = fields.description;
      if (typeof fields.notes === "string" || fields.notes === null)
        update.notes = fields.notes;
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
