import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { prisma } = await import("@/lib/prisma");

  // Ensure all 6 areas exist
  const existing = await prisma.lifeMapArea.findMany({ where: { userId } });
  const existingNames = new Set(existing.map((a) => a.area));

  for (const area of DEFAULT_LIFE_AREAS) {
    if (!existingNames.has(area.name)) {
      await prisma.lifeMapArea.create({
        data: {
          userId,
          area: area.name,
          name: area.name,
          color: area.color,
          icon: area.icon,
          sortOrder: DEFAULT_LIFE_AREAS.indexOf(area),
        },
      });
    }
  }

  const areas = await prisma.lifeMapArea.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });

  // Fetch memory stats
  const { getOrCreateUserMemory } = await import("@/lib/memory");
  const memory = await getOrCreateUserMemory(userId);

  return NextResponse.json({
    areas,
    memory: {
      totalEntries: memory.totalEntries,
      firstEntryDate: memory.firstEntryDate,
      recurringThemes: memory.recurringThemes,
      recurringPeople: memory.recurringPeople,
      recurringGoals: memory.recurringGoals,
      healthMentions: memory.healthMentions,
      wealthMentions: memory.wealthMentions,
      relationshipMentions: memory.relationshipMentions,
      spiritualityMentions: memory.spiritualityMentions,
      careerMentions: memory.careerMentions,
      growthMentions: memory.growthMentions,
    },
  });
}
