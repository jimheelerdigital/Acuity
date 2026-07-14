/**
 * Achievements catalog page. Server component: fetches the user's
 * Achievement + UserAchievement rows directly via Prisma, hands the
 * shaped data to the client grid for interactivity (badge click →
 * detail panel).
 */

import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

import { AchievementsGrid, type CatalogItem } from "./grid-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Achievements — Ripple",
};

export default async function AchievementsPage() {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/api/auth/signin?callbackUrl=/achievements");
  }

  const { prisma } = await import("@/lib/prisma");

  const [catalog, earned] = await Promise.all([
    prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.userAchievement.findMany({
      where: { userId },
      select: {
        achievementId: true,
        earnedAt: true,
        pointsAwarded: true,
      },
    }),
  ]);

  const earnedById = new Map(earned.map((e) => [e.achievementId, e]));

  const items: CatalogItem[] = catalog.map((a) => {
    const e = earnedById.get(a.id);
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      description: a.description,
      category: a.category as CatalogItem["category"],
      tier: a.tier,
      points: a.points,
      earned: Boolean(e),
      earnedAt: e ? e.earnedAt.toISOString() : null,
      pointsAwarded: e ? e.pointsAwarded : null,
    };
  });

  const totals = {
    earned: earned.length,
    total: catalog.length,
    points: earned.reduce((sum, e) => sum + e.pointsAwarded, 0),
  };

  // Touch the Prisma namespace so the bundler keeps it in the
  // generated client surface. The fetch above already references the
  // models, but keeping the import explicit makes the dependency
  // legible to grep-style audits.
  void Prisma;

  return <AchievementsGrid items={items} totals={totals} />;
}
