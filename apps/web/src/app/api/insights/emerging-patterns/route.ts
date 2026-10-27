/**
 * GET /api/insights/emerging-patterns (2026-10-27)
 *
 * The app's copy of the web /insights "Starting to notice" peek: up to
 * two themes that have each come up in 2+ entries, plus the hedged
 * sentence. Same rules as the web card (lib/emerging-patterns.ts).
 *
 * The Theme Map gate is applied by the CALLER from its own progression
 * (the app's Insights tab already holds it). This route deliberately
 * does not call getUserProgression: that writes the progression
 * snapshot, and a second writer would swallow `recentlyUnlocked` before
 * /api/user/progression could show the unlock.
 *
 * Response: { themes: { label: string }[], copy: string | null }
 * Empty themes + null copy means "render nothing".
 *
 * Auth: cookie session or mobile bearer (getAnySessionUserId).
 */
import { NextRequest, NextResponse } from "next/server";

import {
  emergingPatternsCopy,
  selectEmergingThemes,
} from "@/lib/emerging-patterns";
import { loadEmergingThemeCandidates } from "@/lib/emerging-patterns-data";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  // Same count progression uses (every entry row for the user).
  const entriesCount = await prisma.entry.count({ where: { userId } });
  const candidates =
    entriesCount > 0 ? await loadEmergingThemeCandidates(prisma, userId) : [];

  const emerging = selectEmergingThemes({
    entriesCount,
    themeMapUnlocked: false,
    themes: candidates,
  });

  return NextResponse.json(
    {
      themes: emerging.map((t) => ({ label: t.label })),
      copy: emergingPatternsCopy(emerging),
    },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
