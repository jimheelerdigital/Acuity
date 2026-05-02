import { OpenTasksCard } from "../open-tasks-card";

/**
 * Open tasks section. Fetches up to 10 open tasks plus the user's
 * task groups. Defensive: if either query fails, OpenTasksCard's
 * "Other" fallback bucket handles a missing groups array
 * gracefully — but inside Suspense, the boundary's error.tsx will
 * render a per-card error state instead of breaking the dashboard.
 */
export async function OpenTasksSection({ userId }: { userId: string }) {
  const { prisma } = await import("@/lib/prisma");

  const [tasks, groups] = await Promise.all([
    prisma.task.findMany({
      where: { userId, status: { in: ["TODO", "IN_PROGRESS", "OPEN"] } },
      // Explicit select — production DB doesn't yet have the C3
      // calendarEventId/calendarSyncedAt/calendarSyncStatus columns
      // (db push pending). Default projection would trigger P2022
      // and fail every dashboard render. Re-broaden the select once
      // the migration lands.
      select: {
        id: true,
        title: true,
        text: true,
        status: true,
        priority: true,
        groupId: true,
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 10,
    }),
    prisma.taskGroup.findMany({
      where: { userId },
      select: { id: true, name: true, color: true, order: true },
      orderBy: { order: "asc" },
    }),
  ]);

  return (
    <OpenTasksCard
      initialTasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        text: t.text,
        status: t.status,
        priority: t.priority,
        groupId: t.groupId ?? null,
      }))}
      groups={groups}
    />
  );
}
