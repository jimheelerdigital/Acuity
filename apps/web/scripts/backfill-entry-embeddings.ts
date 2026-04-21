/**
 * Backfill Entry.embedding for legacy entries that predate the
 * Ask-Your-Past-Self feature.
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx apps/web/scripts/backfill-entry-embeddings.ts
 *
 * Properties:
 *   - Idempotent. Skips rows with a non-empty embedding (unless
 *     `--force` passed).
 *   - Paged by id ordering + cursor. BATCH_SIZE=50 keeps us within
 *     OpenAI's embedding rate-limit headroom without batch API
 *     (simpler; embedding cost is tiny).
 *   - Respects OPENAI_API_KEY. Fails loudly if missing.
 *   - Progress logs: "Processed N/M · embedded E · skipped S".
 *   - Manual-run only. Jim fires after deploying the schema + code.
 */

import { PrismaClient } from "@prisma/client";

import { buildEmbedText, embedText } from "../src/lib/embeddings";

const BATCH_SIZE = 50;

async function main() {
  const force = process.argv.includes("--force");
  const prisma = new PrismaClient();

  if (!process.env.OPENAI_API_KEY) {
    console.error("[backfill-embeddings] OPENAI_API_KEY missing. Aborting.");
    process.exit(1);
  }

  const total = await prisma.entry.count({ where: { status: "COMPLETE" } });
  if (total === 0) {
    console.log("[backfill-embeddings] No COMPLETE entries. Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  console.log(
    `[backfill-embeddings] Scanning ${total} COMPLETE entries (force=${force})…`
  );

  type BatchEntry = {
    id: string;
    summary: string | null;
    transcript: string | null;
    embedding: number[];
  };

  let processed = 0;
  let embedded = 0;
  let skipped = 0;
  let lastCursor: string | null = null;

  /* eslint-disable no-constant-condition */
  while (true) {
    const batch: BatchEntry[] = await prisma.entry.findMany({
      where: { status: "COMPLETE" },
      select: { id: true, summary: true, transcript: true, embedding: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(lastCursor ? { cursor: { id: lastCursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;

    for (const entry of batch) {
      processed += 1;
      if (!force && Array.isArray(entry.embedding) && entry.embedding.length > 0) {
        skipped += 1;
        continue;
      }
      const text = buildEmbedText(entry);
      if (!text) {
        skipped += 1;
        continue;
      }
      try {
        const vec = await embedText(text);
        await prisma.entry.update({
          where: { id: entry.id },
          data: { embedding: vec },
        });
        embedded += 1;
      } catch (err) {
        console.warn(
          `[backfill-embeddings] failed entry ${entry.id}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    lastCursor = batch[batch.length - 1].id;
    console.log(
      `[backfill-embeddings] Processed ${processed}/${total} · embedded ${embedded} · skipped ${skipped}`
    );
    if (batch.length < BATCH_SIZE) break;
  }
  /* eslint-enable no-constant-condition */

  console.log(
    `\n[backfill-embeddings] DONE. ${processed} entries scanned, ${embedded} embedded, ${skipped} skipped.`
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill-embeddings] FAILED", err);
  process.exit(1);
});
