import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const all = req.nextUrl.searchParams.get("all") === "1";

  const tasks = await prisma.task.findMany({
    where: {
      userId: session.user.id,
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
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      userId: session.user.id,
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
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    where: { id: body.id, userId: session.user.id },
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
