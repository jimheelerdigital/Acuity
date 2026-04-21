/**
 * Theme Map backfill — projects legacy Entry.themes (String[]) rows
 * into the new relational Theme + ThemeMention model landed alongside
 * the Theme Evolution Map.
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx apps/web/scripts/backfill-theme-mentions.ts
 *
 * Properties:
 *   - Idempotent. ThemeMention has a (themeId, entryId) unique key, so
 *     re-running is a no-op on rows already written. Safe to hammer.
 *   - Paged. Walks entries in chunks of BATCH_SIZE to keep memory flat
 *     on a DB with thousands of rows.
 *   - Pre-prompt-update entries lack per-theme sentiment, so backfilled
 *     mentions land as NEUTRAL. Documented in THEME_MAP_DATA_AUDIT.md.
 *     New entries (post-deploy) get real sentiment from Claude.
 *   - Progress logs every batch: "Processed N/M entries…"
 *   - Manual-run only. No cron hook. If re-runs become routine we can
 *     wrap in an Inngest function later.
 */

import { PrismaClient } from "@prisma/client";

import {
  coerceSentiment,
  normalizeThemeName,
  recordMention,
  upsertTheme,
} from "../src/lib/themes";

const BATCH_SIZE = 200;

type RawThemeLike =
  | string
  | {
      label?: unknown;
      sentiment?: unknown;
    };

async function main() {
  const prisma = new PrismaClient();

  // Scope: COMPLETE entries only. PARTIAL entries may have half-
  // extracted themes; PENDING/PROCESSING/FAILED don't have extraction
  // data worth persisting. This matches the read set of every
  // downstream theme consumer.
  const totalEntries = await prisma.entry.count({
    where: { status: "COMPLETE" },
  });

  if (totalEntries === 0) {
    console.log("[backfill] No COMPLETE entries found. Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  console.log(
    `[backfill] Scanning ${totalEntries} COMPLETE entries in batches of ${BATCH_SIZE}…`
  );

  let processed = 0;
  let themesUpserted = 0;
  let mentionsWritten = 0;
  let lastCursor: string | null = null;
  let skippedNoThemes = 0;

  type BatchEntry = {
    id: string;
    userId: string;
    themes: string[];
    rawAnalysis: unknown;
    createdAt: Date;
  };

  /* eslint-disable no-constant-condition */
  while (true) {
    const batch: BatchEntry[] = await prisma.entry.findMany({
      where: { status: "COMPLETE" },
      select: {
        id: true,
        userId: true,
        themes: true,
        rawAnalysis: true,
        createdAt: true,
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(lastCursor ? { cursor: { id: lastCursor }, skip: 1 } : {}),
    });

    if (batch.length === 0) break;

    for (const entry of batch) {
      // Prefer rawAnalysis.themesDetailed when the entry was extracted
      // post-prompt-update (sentiment is real). Fall back to rawAnalysis
      // .themes (legacy string[] inside the JSON), then the top-level
      // Entry.themes array. Any of these can be absent on very old rows.
      const raw = (entry.rawAnalysis ?? {}) as {
        themesDetailed?: RawThemeLike[];
        themes?: RawThemeLike[];
      };
      const source: RawThemeLike[] =
        (Array.isArray(raw.themesDetailed) ? raw.themesDetailed : null) ??
        (Array.isArray(raw.themes) ? raw.themes : null) ??
        (Array.isArray(entry.themes)
          ? (entry.themes as unknown as RawThemeLike[])
          : []);

      if (source.length === 0) {
        skippedNoThemes += 1;
        processed += 1;
        continue;
      }

      // Dedupe inside this entry by normalized name so we don't emit
      // two mentions for the same theme when the user said "stresses"
      // and "stress" in the same debrief — the unique (themeId, entryId)
      // constraint would reject the second anyway but skipping early
      // keeps our counters honest.
      const seenInEntry = new Set<string>();

      for (const item of source) {
        let label: string;
        let sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
        if (typeof item === "string") {
          label = item;
          sentiment = "NEUTRAL";
        } else if (item && typeof item === "object") {
          if (typeof item.label !== "string") continue;
          label = item.label;
          sentiment = coerceSentiment(item.sentiment);
        } else {
          continue;
        }

        const normalized = normalizeThemeName(label);
        if (!normalized || seenInEntry.has(normalized)) continue;
        seenInEntry.add(normalized);

        const theme = await upsertTheme(prisma, entry.userId, label);
        if (!theme) continue;
        // `theme.createdAt === now` on first insert; on subsequent
        // re-runs we're just bumping themesUpserted for accounting.
        // The returned row is the canonical Theme either way.
        themesUpserted += 1;

        await recordMention(
          prisma,
          theme.id,
          entry.id,
          sentiment,
          entry.createdAt
        );
        mentionsWritten += 1;
      }

      processed += 1;
    }

    lastCursor = batch[batch.length - 1].id;
    console.log(
      `[backfill] Processed ${processed}/${totalEntries} entries — ` +
        `${themesUpserted} themes touched, ${mentionsWritten} mentions written, ` +
        `${skippedNoThemes} skipped (no themes).`
    );

    if (batch.length < BATCH_SIZE) break;
  }
  /* eslint-enable no-constant-condition */

  console.log(
    `\n[backfill] DONE. ${processed} entries, ${themesUpserted} theme touches, ${mentionsWritten} mention writes, ${skippedNoThemes} skipped.`
  );

  // Sanity probe: count distinct themes + mentions now present so the
  // operator can compare against the prior run at a glance.
  const [themeCount, mentionCount] = await Promise.all([
    prisma.theme.count(),
    prisma.themeMention.count(),
  ]);
  console.log(
    `[backfill] DB state: ${themeCount} Theme rows, ${mentionCount} ThemeMention rows.`
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill] FAILED", err);
  process.exit(1);
});
