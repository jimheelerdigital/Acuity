import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const entry = await prisma.entry.findUnique({
    where: { id: params.id },
    include: {
      tasks: {
        select: {
          id: true,
          // `title` + `description` were missing here — caused the mobile
          // Entry view's Tasks section to render card shells with empty
          // bodies (priority + status pill only). `text` is a legacy
          // Task field; both the mobile Entry card and TaskDTO consume
          // `title`, so select that directly and drop `text` from the
          // projection.
          title: true,
          description: true,
          dueDate: true,
          priority: true,
          status: true,
          // goalId + groupId align the shape with TaskDTO / the full
          // Task row so downstream consumers (including future deep-
          // link-from-entry-to-goal) don't need a second query.
          goalId: true,
          groupId: true,
          entryId: true,
          createdAt: true,
        },
      },
    },
  });

  if (!entry || entry.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    entry: {
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      tasks: entry.tasks.map((t) => ({
        ...t,
        dueDate: t.dueDate?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
    },
  });
}
