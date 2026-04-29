import { GoalsSnapshotCard, type SnapshotGoal } from "../goals-snapshot";

/**
 * Goals snapshot section. Top 3 active goals (IN_PROGRESS first,
 * NOT_STARTED next). Excludes COMPLETE/ON_HOLD/ARCHIVED — those
 * don't belong on the at-a-glance dashboard surface.
 */
export async function GoalsSnapshotSection({ userId }: { userId: string }) {
  const goals = await fetchSnapshotGoals(userId);
  return <GoalsSnapshotCard goals={goals} />;
}

async function fetchSnapshotGoals(userId: string): Promise<SnapshotGoal[]> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.goal.findMany({
    where: { userId, status: { in: ["IN_PROGRESS", "NOT_STARTED"] } },
    orderBy: [
      { status: "asc" },
      { lastMentionedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: 3,
    select: {
      id: true,
      title: true,
      status: true,
      progress: true,
      lifeArea: true,
    },
  });
  return rows;
}
