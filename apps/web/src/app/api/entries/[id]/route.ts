import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entry = await prisma.entry.findUnique({
    where: { id: params.id },
    include: {
      tasks: {
        select: {
          id: true,
          text: true,
          
          dueDate: true,
          priority: true,
          status: true,
          goalId: true,
          entryId: true,
          createdAt: true,
        },
      },
    },
  });

  if (!entry || entry.userId !== session.user.id) {
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
