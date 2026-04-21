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

  const all = req.nextUrl.searchParams.get("all") === "1";

  const tasks = await prisma.task.findMany({
    where: {
      userId: userId,
      ...(all ? {} : { status: { not: "DONE" } }),
    },
    include: { entry: { select: { entryDate: true } } },
    orderBy: { createdAt: "desc" },
  });

  const priorityOrder: Record<string, number> = {
    URGENT: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };

  tasks.sort(
    (a, b) =>
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
  );

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body?.text && !body?.title) {
    return NextResponse.json(
      { error: "Missing required field: title" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  const task = await prisma.task.create({
    data: {
      userId: userId,
      text: body.title ?? body.text,
      title: body.title ?? body.text,
      description: body.description ?? null,
      priority: body.priority ?? "MEDIUM",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    },
  });

  return NextResponse.json({ task }, { status: 201 });
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

  // Verify ownership
  const existing = await prisma.task.findFirst({
    where: { id: body.id, userId: userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let data: Record<string, unknown>;

  switch (body.action) {
    case "complete":
      data = { status: "DONE", completedAt: new Date() };
      break;
    case "snooze":
      data = {
        status: "SNOOZED",
        snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      break;
    case "reopen":
      data = { status: "OPEN", snoozedUntil: null, completedAt: null };
      break;
    case "dismiss":
      await prisma.task.delete({ where: { id: body.id } });
      return NextResponse.json({ success: true });
    case "edit": {
      const fields = body.fields as Record<string, unknown> | undefined;
      if (!fields || typeof fields !== "object") {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      const VALID_PRIORITY = ["URGENT", "HIGH", "MEDIUM", "LOW"];
      const update: Record<string, unknown> = {};
      if (typeof fields.title === "string") {
        update.title = fields.title.trim();
        update.text = fields.title.trim();
      }
      if (typeof fields.description === "string" || fields.description === null) {
        update.description = fields.description;
      }
      if (typeof fields.priority === "string") {
        if (!VALID_PRIORITY.includes(fields.priority)) {
          return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
        }
        update.priority = fields.priority;
      }
      if (typeof fields.dueDate === "string" || fields.dueDate === null) {
        update.dueDate = fields.dueDate ? new Date(fields.dueDate as string) : null;
      }
      data = update;
      break;
    }
    default:
      return NextResponse.json(
        { error: "Invalid action" },
        { status: 400 }
      );
  }

  const task = await prisma.task.update({
    where: { id: body.id },
    data,
  });

  return NextResponse.json({ task });
}
