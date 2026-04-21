import "server-only";

import {
  PROGRESSION_ITEMS,
  type ProgressionItemKey,
  type ProgressionState,
  progressionChecklistExpired,
  visibleProgressionItems,
} from "@acuity/shared";

export type { ProgressionItemKey, ProgressionState };

/**
 * Compute the current progression-checklist state for a user. Merges
 * three sources:
 *   1. Days-since-signup → which items are unlocked.
 *   2. Stored JSON from UserOnboarding.progressionChecklist → which
 *      items the user has explicitly marked complete.
 *   3. Live DB signals → auto-complete for items we can detect
 *      (Entry exists, WeeklyReport exists, LifeAudit exists).
 *
 * Returns null when the checklist should be hidden entirely (user
 * dismissed it, or > 14 days since signup).
 *
 * Caller: dashboard page.tsx server component. One DB round-trip per
 * page load — acceptable cost for a feature that drives first-week
 * retention.
 */
export async function computeProgressionState(params: {
  userId: string;
  createdAt: Date;
  storedState: ProgressionState | null;
}): Promise<{
  items: Array<{
    key: ProgressionItemKey;
    title: string;
    description: string;
    href: string;
    completed: boolean;
  }>;
  completedCount: number;
  totalVisibleCount: number;
} | null> {
  const { createdAt, storedState } = params;

  if (progressionChecklistExpired(createdAt)) return null;
  if (storedState?.dismissedAt) return null;

  const visible = visibleProgressionItems(createdAt);
  if (visible.length === 0) return null;

  // Collect the auto-complete signals in parallel. Each is a single
  // count query; Prisma resolves these concurrently via Promise.all.
  const { prisma } = await import("@/lib/prisma");
  const [entryCount, weeklyCount, auditCount] = await Promise.all([
    PROGRESSION_ITEMS.some((i) => i.autoComplete === "entry-exists")
      ? prisma.entry.count({ where: { userId: params.userId } })
      : Promise.resolve(0),
    PROGRESSION_ITEMS.some((i) => i.autoComplete === "weekly-report-exists")
      ? prisma.weeklyReport.count({
          where: { userId: params.userId, status: "COMPLETE" },
        })
      : Promise.resolve(0),
    PROGRESSION_ITEMS.some((i) => i.autoComplete === "life-audit-exists")
      ? prisma.lifeAudit.count({ where: { userId: params.userId } })
      : Promise.resolve(0),
  ]);

  const storedItems = storedState?.items ?? {};

  const items = visible.map((item) => {
    const manualCompletedAt = storedItems[item.key];
    let completed = Boolean(manualCompletedAt);
    if (!completed) {
      if (item.autoComplete === "entry-exists" && entryCount > 0) completed = true;
      if (item.autoComplete === "weekly-report-exists" && weeklyCount > 0)
        completed = true;
      if (item.autoComplete === "life-audit-exists" && auditCount > 0)
        completed = true;
    }
    return {
      key: item.key,
      title: item.title,
      description: item.description,
      href: item.href,
      completed,
    };
  });

  const completedCount = items.filter((i) => i.completed).length;

  return {
    items,
    completedCount,
    totalVisibleCount: visible.length,
  };
}
