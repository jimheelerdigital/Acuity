/**
 * Review-gate 7-day backstop (Issue B, v1.3.3). Daily cron that auto-commits
 * background-processed entries the user never reviewed — the guardrail
 * against the 138-orphan-tasks regression that the auto-commit change fixed.
 *
 * An entry's extracted tasks/goals live in Entry.rawAnalysis until the user
 * confirms them via the review gate (/api/entries/[id]/extraction) — which
 * sets extractionCommittedAt (on both "Commit" and "Skip all"). So an entry
 * with extractionCommittedAt STILL NULL after 7 days is one the user never
 * looked back at; we commit it silently so the tasks/goals aren't lost.
 *
 * Idempotent: the where-clause gates on extractionCommittedAt = null, and a
 * re-check inside each per-entry transaction prevents a double-commit if a
 * concurrent review lands mid-run. Bounded to 250 entries/run.
 */
import { Prisma } from "@prisma/client";
import type { ExtractedGoal, ExtractedTask } from "@acuity/shared";

import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const commitExtractionBackstopFn = inngest.createFunction(
  {
    id: "commit-extraction-backstop",
    name: "Review-gate 7-day auto-commit backstop",
    triggers: [{ cron: "0 9 * * *" }], // daily 09:00 UTC
    retries: 2,
  },
  async () => {
    const { prisma } = await import("@/lib/prisma");
    const { commitExtractedItems } = await import("@/lib/commit-extraction");
    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);

    const candidates = await prisma.entry.findMany({
      where: {
        status: "COMPLETE",
        extractionCommittedAt: null,
        createdAt: { lt: cutoff },
        rawAnalysis: { not: Prisma.DbNull },
      },
      select: { id: true, userId: true, rawAnalysis: true },
      take: 250,
    });

    let committed = 0;
    for (const e of candidates) {
      const ex = e.rawAnalysis as unknown as {
        tasks?: ExtractedTask[];
        goals?: ExtractedGoal[];
      } | null;
      try {
        const didCommit = await prisma.$transaction(async (tx) => {
          // Re-check inside the tx so a concurrent review can't be
          // double-committed (idempotency guard).
          const fresh = await tx.entry.findUnique({
            where: { id: e.id },
            select: { extractionCommittedAt: true },
          });
          if (fresh?.extractionCommittedAt) return false;
          await commitExtractedItems(
            tx,
            e.userId,
            e.id,
            ex?.tasks ?? [],
            ex?.goals ?? []
          );
          await tx.entry.update({
            where: { id: e.id },
            data: { extracted: true, extractionCommittedAt: new Date() },
          });
          return true;
        });
        if (!didCommit) continue;
        committed += 1;
        // Analytics — fire-and-forget (non-fatal).
        await prisma.onboardingEvent
          .create({
            data: { userId: e.userId, event: "backstop_committed", value: e.id },
          })
          .catch(() => {});
      } catch (err) {
        safeLog.error("commit-extraction-backstop.entry_failed", {
          entryId: e.id,
          err: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    safeLog.info("commit-extraction-backstop.run", {
      candidates: candidates.length,
      committed,
    });
    return { candidates: candidates.length, committed };
  }
);
