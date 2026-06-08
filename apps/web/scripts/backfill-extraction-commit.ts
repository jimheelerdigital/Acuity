/**
 * One-off backfill — materialize extracted tasks/goals for entries whose
 * candidates were stranded by the old review-commit gate (dropped
 * 2026-06-08). Reuses `commitExtractedItems`, so the rows it creates are
 * byte-for-byte what the new auto-commit path produces.
 *
 * SAFE / IDEMPOTENT:
 *   - Only touches entries with ZERO existing Task rows (re-checked inside
 *     each per-entry transaction), so re-running creates no duplicates.
 *   - Goals dedupe by case-insensitive title (existing → bump, new →
 *     create), so goal creation is idempotent across re-runs too.
 *   - Default mode is DRY-RUN. Nothing writes unless you pass --commit.
 *
 * Usage (run from a network that can reach the Supabase DB — per
 * CLAUDE.md the work Mac blocks Supabase ports, so run from home):
 *   DATABASE_URL=<prod> npx tsx apps/web/scripts/backfill-extraction-commit.ts            # dry-run
 *   DATABASE_URL=<prod> npx tsx apps/web/scripts/backfill-extraction-commit.ts --commit   # writes
 *   ...add --since=2026-05-09 to limit the window.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { commitExtractedItems } from "@/lib/commit-extraction";
import type { ExtractedGoal, ExtractedTask } from "@acuity/shared";

async function main() {
  const commit = process.argv.includes("--commit");
  const sinceArg = process.argv.find((a) => a.startsWith("--since="));
  const since = sinceArg ? new Date(sinceArg.split("=")[1]) : undefined;

  const candidates = await prisma.entry.findMany({
    where: {
      status: "COMPLETE",
      rawAnalysis: { not: Prisma.JsonNull },
      tasks: { none: {} }, // idempotency: skip entries that already have Task rows
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: {
      id: true,
      userId: true,
      rawAnalysis: true,
      createdAt: true,
      extractionCommittedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let touched = 0;
  let totalTasks = 0;
  let totalGoals = 0;

  for (const e of candidates) {
    const raw = e.rawAnalysis as { tasks?: ExtractedTask[]; goals?: ExtractedGoal[] } | null;
    const tasks = raw?.tasks ?? [];
    const goals = raw?.goals ?? [];
    if (tasks.length === 0 && goals.length === 0) continue;

    if (!commit) {
      console.log(`[dry] entry ${e.id} (${e.createdAt.toISOString().slice(0, 10)}) → ${tasks.length} tasks, ${goals.length} goals`);
      touched += 1;
      totalTasks += tasks.length;
      totalGoals += goals.length;
      continue;
    }

    const res = await prisma.$transaction(async (tx) => {
      // Re-check inside the tx so a concurrent write (e.g. the user
      // committing in-app between query and write) can't double-create.
      const existing = await tx.task.count({ where: { entryId: e.id } });
      if (existing > 0) return { tasksCreated: 0, goalsCreated: 0, skipped: true as const };
      const r = await commitExtractedItems(tx, e.userId, e.id, tasks, goals);
      await tx.entry.update({
        where: { id: e.id },
        data: {
          extracted: true,
          // preserve an existing commit timestamp; only stamp if absent
          ...(e.extractionCommittedAt ? {} : { extractionCommittedAt: new Date() }),
        },
      });
      return { ...r, skipped: false as const };
    });

    if (!res.skipped) {
      touched += 1;
      totalTasks += res.tasksCreated;
      totalGoals += res.goalsCreated;
    }
    console.log(`[commit] entry ${e.id} → +${res.tasksCreated} tasks, +${res.goalsCreated} goals${res.skipped ? " (skipped — already had tasks)" : ""}`);
  }

  console.log(`\n${commit ? "COMMITTED" : "DRY RUN"}: ${touched} entries, ${totalTasks} tasks, ${totalGoals} goals${since ? ` (since ${since.toISOString().slice(0, 10)})` : " (all-time)"}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
