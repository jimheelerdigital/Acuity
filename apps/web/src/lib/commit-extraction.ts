import type { Prisma } from "@prisma/client";
import type { ExtractedGoal, ExtractedTask } from "@acuity/shared";

const VALID_PRIORITIES = new Set(["URGENT", "HIGH", "MEDIUM", "LOW"]);

/**
 * Materialize a recording's extracted tasks + goals into real Task/Goal
 * rows. Shared by the extraction pipeline (auto-commit on persist, both
 * the Inngest and sync paths) and available for the backfill of entries
 * whose candidates were never committed.
 *
 * 2026-06-08: this replaces the old "review gate" where extracted tasks
 * were parked in Entry.rawAnalysis.tasks until the user manually
 * committed them — a gate that broke the core promise (80% of
 * extractions never got committed). Tasks now appear immediately; users
 * edit/delete unwanted items from the Tasks/Goals lists post-hoc.
 *
 * Idempotency: callers gate on a per-entry condition (extractionCommittedAt
 * for live writes; "no existing Task rows for this entry" for the
 * backfill) so re-running can't duplicate tasks. Goals dedupe by
 * case-insensitive title (existing → bump lastMentionedAt + entryRefs;
 * new → create), so goal creation is naturally idempotent across re-runs.
 */
export async function commitExtractedItems(
  tx: Prisma.TransactionClient,
  userId: string,
  entryId: string,
  tasks: ExtractedTask[] = [],
  goals: ExtractedGoal[] = []
): Promise<{ tasksCreated: number; goalsCreated: number }> {
  // ── Tasks ──────────────────────────────────────────────────────────
  const validTasks = (tasks ?? []).filter(
    (t) => t && typeof t.title === "string" && t.title.trim().length > 0
  );
  let tasksCreated = 0;
  if (validTasks.length > 0) {
    // Resolve Claude's groupName → TaskGroup.id (case-insensitive),
    // falling back to the user's "Other" group when unmatched. Mirror of
    // the commit route's resolution.
    const groups = await tx.taskGroup.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const groupIdByName = new Map<string, string>();
    for (const g of groups) groupIdByName.set(g.name.toLowerCase(), g.id);
    const otherGroupId = groupIdByName.get("other") ?? null;

    const { count } = await tx.task.createMany({
      data: validTasks.map((t) => {
        const priority = VALID_PRIORITIES.has(t.priority)
          ? t.priority
          : "MEDIUM";
        const resolved = t.groupName
          ? groupIdByName.get(t.groupName.trim().toLowerCase())
          : undefined;
        return {
          userId,
          entryId,
          text: t.title,
          title: t.title.trim().slice(0, 300),
          description: t.description?.toString().slice(0, 2000) ?? null,
          priority,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          groupId: resolved ?? otherGroupId,
        };
      }),
    });
    tasksCreated = count;
  }

  // ── Goals: existing → bump, new → create ───────────────────────────
  let goalsCreated = 0;
  for (const g of goals ?? []) {
    if (!g || typeof g.title !== "string" || g.title.trim().length === 0) {
      continue;
    }
    const existing = await tx.goal.findFirst({
      where: { userId, title: { equals: g.title, mode: "insensitive" } },
      select: { id: true, entryRefs: true, editedByUser: true },
    });
    if (existing) {
      const refs = Array.from(
        new Set([...(existing.entryRefs ?? []), entryId])
      );
      await tx.goal.update({
        where: { id: existing.id },
        data: {
          lastMentionedAt: new Date(),
          entryRefs: refs,
          // Don't clobber a description the user has edited.
          ...(!existing.editedByUser && g.description
            ? { description: g.description }
            : {}),
        },
      });
      continue;
    }
    await tx.goal.create({
      data: {
        userId,
        title: g.title.trim().slice(0, 200),
        description: g.description?.toString().slice(0, 2000) ?? null,
        targetDate: g.targetDate ? new Date(g.targetDate) : null,
        lifeArea: "PERSONAL",
        lastMentionedAt: new Date(),
        entryRefs: [entryId],
      },
    });
    goalsCreated += 1;
  }

  return { tasksCreated, goalsCreated };
}
