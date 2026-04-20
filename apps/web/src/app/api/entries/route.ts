import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import type { EntryDTO } from "@acuity/shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const entries = await prisma.entry.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      transcript: true,
      summary: true,
      mood: true,
      moodScore: true,
      energy: true,
      themes: true,
      wins: true,
      blockers: true,
      rawAnalysis: true,
      audioUrl: true,
      audioPath: true,
      audioDuration: true,
      status: true,
      createdAt: true,
    },
  });

  const dtos: EntryDTO[] = entries.map((e) => {
    const insights =
      e.rawAnalysis &&
      typeof e.rawAnalysis === "object" &&
      "insights" in (e.rawAnalysis as Record<string, unknown>)
        ? ((e.rawAnalysis as Record<string, unknown>).insights as string[])
        : [];

    return {
      ...e,
      transcript: e.transcript ?? "",
      mood: e.mood as EntryDTO["mood"],
      moodScore: e.moodScore ?? null,
      insights,
      createdAt: e.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ entries: dtos });
}
