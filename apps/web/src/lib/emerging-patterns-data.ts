import type { PrismaClient } from "@prisma/client";

import { MIN_ENTRIES_PER_THEME, type EmergingTheme } from "@/lib/emerging-patterns";

/**
 * The DB half of the emerging-patterns peek, shared by the web card
 * (app/insights/emerging-patterns-card.tsx) and the app's endpoint
 * (GET /api/insights/emerging-patterns). Selection + copy stay in the
 * pure lib/emerging-patterns.ts.
 *
 * Returns every theme that has appeared in >= MIN_ENTRIES_PER_THEME
 * distinct entries (ThemeMention is @@unique([themeId, entryId]), so the
 * group-by count is an entry count, not a mention count), most-seen
 * first, capped at 8 candidates.
 */
export async function loadEmergingThemeCandidates(
  db: Pick<PrismaClient, "themeMention" | "theme">,
  userId: string
): Promise<EmergingTheme[]> {
  const rows = await db.themeMention.groupBy({
    by: ["themeId"],
    where: { theme: { is: { userId } } },
    _count: { themeId: true },
    having: { themeId: { _count: { gte: MIN_ENTRIES_PER_THEME } } },
    orderBy: { _count: { themeId: "desc" } },
    take: 8,
  });
  if (rows.length === 0) return [];

  const themeRecords = await db.theme.findMany({
    where: { id: { in: rows.map((r) => r.themeId) }, userId },
    select: { id: true, name: true },
  });
  const nameById = new Map(themeRecords.map((t) => [t.id, t.name]));

  return rows.map((r) => ({
    label: nameById.get(r.themeId) ?? "",
    entryCount:
      (r._count as { themeId?: number } | undefined)?.themeId ?? 0,
  }));
}
