import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

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
    },
  });

  return NextResponse.json({ goal }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
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

  const existing = await prisma.goal.findFirst({
    where: { id: body.id, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  let data: Record<string, unknown>;

  switch (body.action) {
    case "complete":
      data = { status: "COMPLETED", progress: 100 };
      break;
    case "pause":
      data = { status: "PAUSED" };
      break;
    case "resume":
      data = { status: "ACTIVE" };
      break;
    case "archive":
      data = { status: "ABANDONED" };
      break;
    case "progress":
      if (typeof body.progress !== "number" || body.progress < 0 || body.progress > 100) {
        return NextResponse.json(
          { error: "progress must be a number 0-100" },
          { status: 400 }
        );
      }
      data = { progress: body.progress };
      break;
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const goal = await prisma.goal.update({
    where: { id: body.id },
    data,
  });

  return NextResponse.json({ goal });
}
