import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const { generateLifeMapInsights, compressMemory, getOrCreateUserMemory } =
      await import("@/lib/memory");

    // Compress memory if stale (> 7 days since last compression)
    const memory = await getOrCreateUserMemory(userId);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (!memory.lastCompressed || memory.lastCompressed < sevenDaysAgo) {
      await compressMemory(userId);
    }

    // Generate fresh insights
    await generateLifeMapInsights(userId);

    // Return updated areas
    const { prisma } = await import("@/lib/prisma");
    const areas = await prisma.lifeMapArea.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ areas }, { status: 200 });
  } catch (err) {
    console.error("[lifemap/refresh] Failed:", err);
    return NextResponse.json(
      { error: "Failed to refresh Life Map" },
      { status: 500 }
    );
  }
}
