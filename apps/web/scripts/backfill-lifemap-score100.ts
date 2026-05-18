/**
 * Backfill apps/web LifeMapArea.score100 from existing score (1-10).
 *
 * Slice N (2026-05-18). After `npx prisma db push` adds the score100
 * column (default 50), every existing LifeMapArea row needs score100
 * populated to match the user's current displayed value.
 *
 * Formula: score100 = score * 10
 *
 * Rationale:
 *   - Build 42 mobile reads `area.score` and multiplies by 10 for
 *     display. So an existing area with `score = 7` shows as "70"
 *     to the user today.
 *   - Build 43+ will read `area.score100` directly (no multiplier).
 *     For users on both builds to see the same value during the
 *     transition window, score100 needs to equal score * 10.
 *
 * Idempotent: re-runs only update rows where score100 still equals
 * the column default (50). Rows already migrated (any value other
 * than 50, OR matching score*10 exactly) are left alone. The
 * default-50 check has one edge case: a real user whose blended
 * score happens to land on exactly 50 mid-transition won't be
 * updated by re-runs — but that's fine, they're already correct.
 *
 * Run from home network (Supabase pool restricted by IP):
 *   cd /Users/jcunningham525/projects/Acuity/apps/web
 *   npx tsx scripts/backfill-lifemap-score100.ts
 *
 * Expected output:
 *   [backfill-lifemap-score100] scanning N rows...
 *   [backfill-lifemap-score100] updated M rows, skipped K (already migrated)
 *
 * Performance: a single UPDATE … FROM batch via raw SQL would be
 * faster but Prisma's transactional batching is fine at our row
 * count (≤ 6 areas × ≤ 200 users = 1200 rows). The dry-run flag
 * is for sanity-checking the count before the write.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(__dirname, "../.env.local") });

import { PrismaClient } from "@prisma/client";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.lifeMapArea.findMany({
      select: { id: true, score: true, score100: true, userId: true, area: true },
    });
    console.log(
      `[backfill-lifemap-score100] scanning ${rows.length} rows${
        DRY_RUN ? " (DRY RUN — no writes)" : ""
      }...`
    );

    let updated = 0;
    let skipped = 0;
    let alreadyCorrect = 0;

    for (const row of rows) {
      const target = row.score * 10;
      // Skip rows that already have the correct value (re-run safety).
      // Also skip if score100 isn't the default 50 — assume someone
      // else (a previous run or a manual fix) already set it.
      if (row.score100 === target) {
        alreadyCorrect++;
        continue;
      }
      if (row.score100 !== 50) {
        // Non-default, non-target value — leave alone. Either a real
        // post-migration write happened, or a partial backfill.
        skipped++;
        continue;
      }
      if (!DRY_RUN) {
        await prisma.lifeMapArea.update({
          where: { id: row.id },
          data: { score100: target },
        });
      }
      updated++;
    }

    console.log(
      `[backfill-lifemap-score100] updated ${updated} rows, ${alreadyCorrect} already correct, skipped ${skipped} (non-default + non-target)`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[backfill-lifemap-score100] failed:", err);
  process.exit(1);
});
