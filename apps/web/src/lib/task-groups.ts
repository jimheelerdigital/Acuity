/**
 * Task group helpers — lazy seeding of the 5 defaults and lookup by
 * name (case-insensitive) used by the extraction pipeline when mapping
 * Claude-assigned groupName → groupId.
 */
import type { PrismaClient } from "@prisma/client";

export type DefaultTaskGroup = {
  name: string;
  icon: string; // Ionicons on mobile, lucide on web — same name mostly maps both ways
  color: string; // hex
  order: number;
};

/**
 * The 5 starter groups every user gets on first task fetch. Order
 * matters: sections render top-to-bottom in this order until the user
 * customizes. "Other" sits last as the catch-all fallback.
 */
export const DEFAULT_TASK_GROUPS: DefaultTaskGroup[] = [
  { name: "Work", icon: "briefcase", color: "#3B82F6", order: 0 },
  { name: "Personal", icon: "person", color: "#7C3AED", order: 1 },
  { name: "Health", icon: "heart", color: "#EF4444", order: 2 },
  { name: "Errands", icon: "cart", color: "#F59E0B", order: 3 },
  { name: "Other", icon: "ellipsis-horizontal", color: "#6B7280", order: 4 },
];

/**
 * Seed the 5 default groups for a user if they have zero groups.
 * Idempotent — safe to call on every /api/task-groups GET or /api/tasks
 * GET. Uses `createMany({ skipDuplicates: true })` so two concurrent
 * seed calls from racing requests don't both try to insert the same
 * (userId, name) rows.
 */
export async function ensureDefaultTaskGroups(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  const existing = await prisma.taskGroup.count({ where: { userId } });
  if (existing > 0) return;

  await prisma.taskGroup.createMany({
    data: DEFAULT_TASK_GROUPS.map((g) => ({
      userId,
      name: g.name,
      icon: g.icon,
      color: g.color,
      order: g.order,
      isDefault: true,
      isAIGenerated: true,
    })),
    skipDuplicates: true,
  });
}

/**
 * Resolve a Claude-assigned groupName string to a TaskGroup.id for
 * this user. Case-insensitive exact match. Falls back to the user's
 * "Other" group (seeded by default) when the match misses. Returns
 * null only if the user somehow has zero groups — shouldn't happen
 * after ensureDefaultTaskGroups runs, but the type is honest.
 */
export async function resolveGroupName(
  prisma: PrismaClient,
  userId: string,
  groupName: string | null | undefined
): Promise<string | null> {
  if (!groupName) return resolveFallbackOther(prisma, userId);

  const normalized = groupName.trim();
  if (!normalized) return resolveFallbackOther(prisma, userId);

  // Case-insensitive match. Prisma mode: "insensitive" requires the
  // PG extension citext on older versions; we rely on the standard
  // postgres collation here which handles ASCII case variants.
  const match = await prisma.taskGroup.findFirst({
    where: {
      userId,
      name: { equals: normalized, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (match) return match.id;

  return resolveFallbackOther(prisma, userId);
}

async function resolveFallbackOther(
  prisma: PrismaClient,
  userId: string
): Promise<string | null> {
  const other = await prisma.taskGroup.findFirst({
    where: { userId, name: { equals: "Other", mode: "insensitive" } },
    select: { id: true },
  });
  return other?.id ?? null;
}
