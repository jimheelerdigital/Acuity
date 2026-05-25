/**
 * Person.mentionCount + archived reconciliation. 2026-05-25 fix
 * for the entry-edit bug where deleting EntityMentions during the
 * wipe phase didn't decrement Person.mentionCount, leaving stale
 * counts visible in /insights/people.
 *
 * Two surfaces call this:
 *   1. PATCH /api/entries/[id] — right after the EntityMention
 *      deleteMany, with the set of personIds that had mentions in
 *      the entry. Reconciles immediately so the directory + counters
 *      are correct from the moment the edit lands.
 *   2. process-entry.ts extract-people step on skipTranscribe runs
 *      — after the resolver writes new mentions. The resolver still
 *      increments mentionCount as it goes (cheap, transient), but
 *      a final reconcile catches any drift from concurrent edits
 *      or P2002 race recovery paths.
 *
 * Both surfaces pass a Set<string> of affected personIds. The
 * helper recomputes COUNT(EntityMention WHERE personId = X) for
 * each, sets mentionCount to that value, and flips archived =
 * (count === 0). Archived Persons disappear from every UI surface
 * but stay in the DB — if the same name comes back in a future
 * entry the resolver finds them via canonicalName + unarchives.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export async function reconcilePersonCounts(
  prisma: PrismaLike,
  personIds: Iterable<string>
): Promise<void> {
  const unique = Array.from(new Set(personIds)).filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
  if (unique.length === 0) return;

  // One COUNT + one UPDATE per Person. Sequential rather than
  // parallel: this only runs on edit-reprocess + occasional batch
  // backfill, both already in a server-only path. Sequential avoids
  // pool exhaustion on a user with 50+ named people.
  for (const personId of unique) {
    const count = await prisma.entityMention.count({ where: { personId } });
    await prisma.person.update({
      where: { id: personId },
      data: {
        mentionCount: count,
        archived: count === 0,
      },
    });
  }
}
