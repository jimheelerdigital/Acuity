import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  // Ensure all 6 canonical areas exist (keyed on the UPPER_CASE enum
  // value stored in LifeMapArea.area).
  const existing = await prisma.lifeMapArea.findMany({ where: { userId } });
  const existingEnums = new Set(existing.map((a) => a.area));

  const missing = DEFAULT_LIFE_AREAS.filter((a) => !existingEnums.has(a.enum));
  if (missing.length > 0) {
    await prisma.lifeMapArea.createMany({
      data: missing.map((a) => ({
        userId,
        area: a.enum,
        name: a.name,
        color: a.color,
        icon: a.icon,
        sortOrder: DEFAULT_LIFE_AREAS.indexOf(a),
      })),
      skipDuplicates: true,
    });
  }

  const areas = await prisma.lifeMapArea.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });

  // Fetch memory stats
  const { getOrCreateUserMemory } = await import("@/lib/memory");
  const memory = await getOrCreateUserMemory(userId);

  // Per-user cache for 60s. The browser revalidates frequently while
  // a user is actively reading /life-matrix; the data only changes
  // when an entry is processed (Inngest, async). 60s of staleness on
  // the radar is invisible. `private` so intermediaries don't share.
  return NextResponse.json(
    {
      areas,
      memory: {
        totalEntries: memory.totalEntries,
        firstEntryDate: memory.firstEntryDate,
        recurringThemes: memory.recurringThemes,
        recurringPeople: memory.recurringPeople,
        recurringGoals: memory.recurringGoals,
        careerMentions: memory.careerMentions,
        healthMentions: memory.healthMentions,
        relationshipsMentions: memory.relationshipsMentions,
        financesMentions: memory.financesMentions,
        personalMentions: memory.personalMentions,
        otherMentions: memory.otherMentions,
      },
    },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
