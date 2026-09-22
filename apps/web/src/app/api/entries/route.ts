import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import type { EntryDTO } from "@acuity/shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  // `?all=1` is the export path (Settings → Export all debriefs). The
  // default stays 30 so every existing caller — Home, Entries, Insights —
  // is byte-for-byte unaffected.
  //
  // Capped rather than unbounded: this selects full transcripts, so an
  // account with thousands of entries would otherwise build a response
  // large enough to exhaust the function's memory. The cap is reported
  // back so the client can tell the user the export is partial instead of
  // silently handing them an incomplete copy and calling it "all".
  const wantAll = req.nextUrl.searchParams.get("all") === "1";
  const EXPORT_CAP = 2000;
  const take = wantAll ? EXPORT_CAP : 30;

  const entries = await prisma.entry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
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

  return NextResponse.json({
    entries: dtos,
    // Only meaningful on the export path; harmless elsewhere.
    ...(wantAll ? { truncated: dtos.length >= EXPORT_CAP, cap: EXPORT_CAP } : {}),
  });
}
