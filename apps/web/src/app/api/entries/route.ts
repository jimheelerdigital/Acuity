import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { EntryDTO } from "@acuity/shared";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.entry.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      transcript: true,
      summary: true,
      mood: true,
      energy: true,
      themes: true,
      wins: true,
      blockers: true,
      audioUrl: true,
      audioDuration: true,
      createdAt: true,
    },
  });

  const dtos: EntryDTO[] = entries.map((e) => ({
    ...e,
    mood: e.mood as EntryDTO["mood"],
    createdAt: e.createdAt.toISOString(),
  }));

  return NextResponse.json({ entries: dtos });
}
