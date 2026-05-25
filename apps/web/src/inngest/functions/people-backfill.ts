/**
 * One-off backfill for Anchor People NER over legacy entries.
 * Slice 7 v1.2.
 *
 * Many users have months of entries from before Anchor People
 * shipped. Those entries have a transcript + summary but no
 * EntityMention rows, so the user shows up to /insights/people
 * with an empty directory. This function walks entries with
 * `peopleExtractedAt IS NULL` (the same idempotency gate the
 * inline NER uses) and runs the detector + resolver pipeline on
 * each.
 *
 * Trigger: invoked via inngest.send({ name: "people/backfill",
 * data: { userId?: string } }). When userId is provided, scope to
 * that single user (canary path — used to test on Jim's account
 * first). When omitted, walk every PRO/TRIAL user with > 5 entries
 * and no extracted rows.
 *
 * Concurrency: one entry at a time per user to keep the Haiku
 * call serial — protects us from upstream rate limits and keeps
 * Person.mentionCount writes coherent within a user. Cross-user
 * runs are parallel up to MAX_PARALLEL_USERS via step.run isolation.
 *
 * Cost: ~$0.0005 per entry, so 100 users × 200 entries ≈ $10. Run
 * this manually until the cost story is settled.
 */

import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";

const ENTRIES_PER_BATCH = 10;
const MAX_ENTRIES_PER_USER = 500; // ceiling per-run to avoid a runaway
const MIN_ENTRIES_TO_BACKFILL = 5;

export const peopleBackfillFn = inngest.createFunction(
  {
    id: "people-backfill",
    name: "Anchor People — NER backfill over legacy entries",
    retries: 1,
    concurrency: 1, // serialize whole-runs to avoid Haiku quota blowup
    triggers: [{ event: "people/backfill" }],
  },
  async ({ event, step, logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const targetUserId = (event.data as { userId?: string })?.userId ?? null;

    // Eligibility: PRO/TRIAL (we never NER FREE users — same gate as
    // the inline pipeline) AND have at least MIN_ENTRIES_TO_BACKFILL
    // entries with no peopleExtractedAt stamp.
    const candidateUsers = targetUserId
      ? await prisma.user.findMany({
          where: { id: targetUserId },
          select: { id: true, subscriptionStatus: true },
        })
      : await prisma.user.findMany({
          where: {
            subscriptionStatus: { in: ["TRIAL", "PRO", "PAST_DUE"] },
            entries: {
              some: { peopleExtractedAt: null, status: "COMPLETE" },
            },
          },
          select: { id: true, subscriptionStatus: true },
        });

    let totalUsers = 0;
    let totalEntries = 0;
    let totalMentions = 0;

    for (const u of candidateUsers) {
      const result = await step.run(`backfill-${u.id}`, async () => {
        return backfillForUser(u.id);
      });
      totalUsers += 1;
      totalEntries += result.entriesProcessed;
      totalMentions += result.mentionsWritten;
    }

    logger.info(
      `people-backfill: ${totalUsers} users, ${totalEntries} entries, ${totalMentions} mentions`
    );
    return { totalUsers, totalEntries, totalMentions };

    async function backfillForUser(
      userId: string
    ): Promise<{ entriesProcessed: number; mentionsWritten: number }> {
      const eligible = await prisma.entry.findMany({
        where: {
          userId,
          peopleExtractedAt: null,
          status: "COMPLETE",
          transcript: { not: null },
        },
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: MAX_ENTRIES_PER_USER,
      });

      if (eligible.length < MIN_ENTRIES_TO_BACKFILL && !targetUserId) {
        // Below threshold — skip unless explicitly canarying a specific
        // user (Jim wants the whole-user backfill on his own account
        // regardless of size).
        return { entriesProcessed: 0, mentionsWritten: 0 };
      }

      const { detectNamedPeople, locateMentions } = await import(
        "@/lib/people-ner"
      );
      const { resolveOrCreatePerson } = await import("@/lib/people-resolver");

      // Single load of existing Persons + their mutable shape used by
      // resolveOrCreatePerson. Walks the batches in serial.
      const existing = await prisma.person.findMany({
        where: { userId },
        select: {
          id: true,
          canonicalName: true,
          displayName: true,
          aliases: true,
          mentionCount: true,
        },
      });

      let entriesProcessed = 0;
      let mentionsWritten = 0;

      for (let i = 0; i < eligible.length; i += ENTRIES_PER_BATCH) {
        const batch = eligible.slice(i, i + ENTRIES_PER_BATCH);
        for (const { id: entryId } of batch) {
          try {
            const entry = await prisma.entry.findUnique({
              where: { id: entryId },
              select: { transcript: true, peopleExtractedAt: true },
            });
            if (!entry?.transcript) continue;
            if (entry.peopleExtractedAt) continue; // double-check guard

            const candidates = await detectNamedPeople(entry.transcript);
            const mentions = locateMentions(entry.transcript, candidates);

            for (const m of mentions) {
              try {
                const { personId } = await resolveOrCreatePerson(
                  prisma,
                  userId,
                  m.mentionText,
                  existing
                );
                await prisma.entityMention.create({
                  data: {
                    entryId,
                    personId,
                    mentionText: m.mentionText,
                    startIndex: m.startIndex,
                    endIndex: m.endIndex,
                    context: m.context,
                  },
                });
                mentionsWritten += 1;
              } catch (err) {
                safeLog.warn("people-backfill.mention_failed", {
                  userId,
                  entryId,
                  mention: m.mentionText.slice(0, 60),
                  err: err instanceof Error ? err.message : String(err),
                });
              }
            }

            await prisma.entry.update({
              where: { id: entryId },
              data: { peopleExtractedAt: new Date() },
            });
            entriesProcessed += 1;
          } catch (err) {
            safeLog.warn("people-backfill.entry_failed", {
              userId,
              entryId,
              err: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      safeLog.info("people-backfill.user_complete", {
        userId,
        entriesProcessed,
        mentionsWritten,
        personsAfter: existing.length,
      });
      return { entriesProcessed, mentionsWritten };
    }
  }
);
