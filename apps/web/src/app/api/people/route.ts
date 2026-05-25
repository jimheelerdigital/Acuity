/**
 * GET /api/people
 *
 * Mobile-facing list of the caller's Persons. Mirrors what
 * /insights/people renders server-side on web. Slice 8 v1.2.
 *
 * Query string:
 *   - ?topN=N           — return only the top-N most-mentioned
 *   - ?withinDays=N     — only include Persons mentioned in the
 *                          rolling N-day window (used by the mobile
 *                          home "People on your mind this week"
 *                          surface, which passes withinDays=7&topN=3)
 *
 * Response: { people: [{ id, displayName, mentionCount,
 * lastMentionedAt }] }. Sorted by mentionCount desc then displayName
 * asc, same as the web directory.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ROWS = 200;

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const topNParam = url.searchParams.get("topN");
  const withinDaysParam = url.searchParams.get("withinDays");
  const topN = topNParam ? Math.max(1, Math.min(MAX_ROWS, Number(topNParam))) : MAX_ROWS;
  const withinDays = withinDaysParam ? Math.max(1, Number(withinDaysParam)) : null;

  const { prisma } = await import("@/lib/prisma");

  // When withinDays is given, scope to Persons with at least one
  // EntityMention in the window. Counts in that mode are window-
  // scoped, not lifetime — matches the mobile home banner copy
  // ("N mentions this week").
  if (withinDays !== null) {
    const cutoff = new Date(Date.now() - withinDays * 86400_000);
    const grouped = await prisma.entityMention.groupBy({
      by: ["personId"],
      where: {
        createdAt: { gte: cutoff },
        person: { is: { userId, archived: false } },
      },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _count: { personId: "desc" } },
      take: topN,
    });
    if (grouped.length === 0) {
      return NextResponse.json({ people: [] });
    }
    const ids = grouped.map((g) => g.personId);
    const persons = await prisma.person.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, displayName: true },
    });
    const byId = new Map(persons.map((p) => [p.id, p.displayName]));
    const people = grouped
      .map((g) => {
        const displayName = byId.get(g.personId);
        if (!displayName) return null;
        return {
          id: g.personId,
          displayName,
          mentionCount: g._count._all,
          lastMentionedAt: g._max.createdAt?.toISOString() ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return NextResponse.json({ people });
  }

  // Lifetime list (default mobile directory).
  const persons = await prisma.person.findMany({
    where: { userId, archived: false },
    orderBy: [{ mentionCount: "desc" }, { displayName: "asc" }],
    take: topN,
    select: {
      id: true,
      displayName: true,
      mentionCount: true,
      firstMentionedAt: true,
    },
  });

  const lastByPerson = new Map<string, Date>();
  if (persons.length > 0) {
    const groups = await prisma.entityMention.groupBy({
      by: ["personId"],
      where: { personId: { in: persons.map((p) => p.id) } },
      _max: { createdAt: true },
    });
    for (const g of groups) {
      if (g._max.createdAt) lastByPerson.set(g.personId, g._max.createdAt);
    }
  }

  return NextResponse.json({
    people: persons.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      mentionCount: p.mentionCount,
      lastMentionedAt:
        (lastByPerson.get(p.id) ?? p.firstMentionedAt).toISOString(),
    })),
  });
}
