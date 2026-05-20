/**
 * Comprehensive admin dashboard data reset. Wipes all historical metrics
 * and analytics data that was polluted from testing, the CompleteRegistration
 * bug, and billing freezes.
 *
 * WHAT GETS DELETED:
 *   - MetaSpend          — all manual ad spend entries (Ads tab)
 *   - RedFlag            — all system alerts (Red Flags tab)
 *   - Waitlist           — all waitlist signups (Funnel step 1)
 *   - ContentPiece       — social content only (TWITTER, TIKTOK, INSTAGRAM,
 *                          AD_COPY, EMAIL, REDDIT_DRAFT). NOT blog posts.
 *   - ContentBriefing    — daily briefing snapshots (source for social content)
 *   - GenerationJob      — content factory job history
 *   - DashboardSnapshot  — cached daily metrics
 *   - AdLabAd            — all ad records (cascade → AdLabDailyMetric, AdLabDecision)
 *   - AdLabExperiment    — reset to draft (campaign fields nulled)
 *
 * WHAT IS PRESERVED:
 *   - User table          — ALL users (Samantha, Kris, test accounts, everyone)
 *   - Entry table         — all recordings
 *   - WeeklyReport        — all reports
 *   - ClaudeCallLog       — all AI cost data
 *   - BlogTopicQueue      — all blog topics
 *   - ContentPiece BLOG   — all blog posts and their metrics
 *   - PruneLog            — blog pruning history
 *   - IndexingLog         — GSC indexing history
 *   - AdLabProject        — project config, brand voice, learned patterns
 *   - AdLabExperiment     — topic briefs (only status/campaign fields reset)
 *   - AdLabAngle          — hypotheses, personas, research, video scripts
 *   - AdLabCreative       — ad copy, images, compliance
 *   - AdLabReferenceImage — visual assets
 *   - AdLabLandingPage    — generated landing pages
 *   - All app config, feature flags, user settings
 *
 * Usage:
 *   # Dry run (default — shows counts, changes nothing):
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/reset-dashboard-data.ts
 *
 *   # Execute:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/reset-dashboard-data.ts --yes
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const execute = process.argv.includes("--yes");

async function main() {
  console.log(
    execute
      ? "\n🔴 LIVE RUN — changes will be committed to the database\n"
      : "\n🟡 DRY RUN — no changes will be made (pass --yes to execute)\n"
  );

  // ── Count everything that will be deleted ────────────────────────
  const metaSpendCount = await prisma.metaSpend.count();
  const redFlagCount = await prisma.redFlag.count();
  const waitlistCount = await prisma.waitlist.count();

  const socialContentCount = await prisma.contentPiece.count({
    where: { type: { in: ["TWITTER", "TIKTOK", "INSTAGRAM", "AD_COPY", "EMAIL", "REDDIT_DRAFT"] } },
  });
  const blogContentCount = await prisma.contentPiece.count({
    where: { type: "BLOG" },
  });
  const briefingCount = await prisma.contentBriefing.count();
  const generationJobCount = await prisma.generationJob.count();
  const snapshotCount = await prisma.dashboardSnapshot.count();

  const adLabAdCount = await prisma.adLabAd.count();
  const adLabMetricCount = await prisma.adLabDailyMetric.count();
  const adLabDecisionCount = await prisma.adLabDecision.count();
  const adLabExperimentCount = await prisma.adLabExperiment.count();
  const adLabNonDraftCount = await prisma.adLabExperiment.count({
    where: { status: { not: "draft" } },
  });

  // ── Count what's preserved ───────────────────────────────────────
  const userCount = await prisma.user.count();
  const entryCount = await prisma.entry.count();
  const claudeLogCount = await prisma.claudeCallLog.count();
  const blogTopicCount = await prisma.blogTopicQueue.count();
  const adLabProjectCount = await prisma.adLabProject.count();
  const adLabAngleCount = await prisma.adLabAngle.count();
  const adLabCreativeCount = await prisma.adLabCreative.count();

  console.log("=== WILL BE DELETED ===");
  console.log(`  MetaSpend rows:            ${metaSpendCount}`);
  console.log(`  RedFlag rows:              ${redFlagCount}`);
  console.log(`  Waitlist rows:             ${waitlistCount}`);
  console.log(`  Social ContentPiece rows:  ${socialContentCount} (TWITTER/TIKTOK/INSTAGRAM/AD_COPY/EMAIL/REDDIT_DRAFT)`);
  console.log(`  ContentBriefing rows:      ${briefingCount}`);
  console.log(`  GenerationJob rows:        ${generationJobCount}`);
  console.log(`  DashboardSnapshot rows:    ${snapshotCount}`);
  console.log(`  AdLabAd rows:              ${adLabAdCount}`);
  console.log(`  AdLabDailyMetric rows:     ${adLabMetricCount} (cascade from AdLabAd)`);
  console.log(`  AdLabDecision rows:        ${adLabDecisionCount} (cascade from AdLabAd)`);
  console.log(`  AdLab experiments to reset: ${adLabNonDraftCount} of ${adLabExperimentCount}`);
  console.log("");
  console.log("=== WILL BE PRESERVED ===");
  console.log(`  User rows:                 ${userCount}`);
  console.log(`  Entry rows:                ${entryCount}`);
  console.log(`  ClaudeCallLog rows:        ${claudeLogCount}`);
  console.log(`  Blog ContentPiece rows:    ${blogContentCount}`);
  console.log(`  BlogTopicQueue rows:       ${blogTopicCount}`);
  console.log(`  AdLabProject rows:         ${adLabProjectCount}`);
  console.log(`  AdLabAngle rows:           ${adLabAngleCount}`);
  console.log(`  AdLabCreative rows:        ${adLabCreativeCount}`);

  if (!execute) {
    console.log("\nPass --yes to execute. Nothing was changed.");
    return;
  }

  console.log("\nExecuting...\n");

  // ── Step 1: Delete standalone metric/tracking tables ─────────────
  const d1 = await prisma.metaSpend.deleteMany({});
  console.log(`  ✓ Deleted ${d1.count} MetaSpend rows`);

  const d2 = await prisma.redFlag.deleteMany({});
  console.log(`  ✓ Deleted ${d2.count} RedFlag rows`);

  const d3 = await prisma.waitlist.deleteMany({});
  console.log(`  ✓ Deleted ${d3.count} Waitlist rows`);

  const d4 = await prisma.dashboardSnapshot.deleteMany({});
  console.log(`  ✓ Deleted ${d4.count} DashboardSnapshot rows`);

  // ── Step 2: Delete social content (NOT blog posts) ───────────────
  // ContentPiece has FK to ContentBriefing — delete pieces first,
  // then briefings that are now orphaned.
  const d5 = await prisma.contentPiece.deleteMany({
    where: { type: { in: ["TWITTER", "TIKTOK", "INSTAGRAM", "AD_COPY", "EMAIL", "REDDIT_DRAFT"] } },
  });
  console.log(`  ✓ Deleted ${d5.count} social ContentPiece rows`);

  // Delete briefings that no longer have any ContentPiece referencing them
  const briefingsWithPieces = await prisma.contentPiece.findMany({
    where: { sourceBriefingId: { not: null } },
    select: { sourceBriefingId: true },
    distinct: ["sourceBriefingId"],
  });
  const usedBriefingIds = new Set(
    briefingsWithPieces.map((p) => p.sourceBriefingId).filter(Boolean)
  );
  const orphanedBriefings = await prisma.contentBriefing.findMany({
    where: { id: { notIn: [...usedBriefingIds] as string[] } },
    select: { id: true },
  });
  if (orphanedBriefings.length > 0) {
    const d5b = await prisma.contentBriefing.deleteMany({
      where: { id: { in: orphanedBriefings.map((b) => b.id) } },
    });
    console.log(`  ✓ Deleted ${d5b.count} orphaned ContentBriefing rows`);
  }

  const d6 = await prisma.generationJob.deleteMany({});
  console.log(`  ✓ Deleted ${d6.count} GenerationJob rows`);

  // ── Step 3: Delete AdLab performance data ────────────────────────
  const d7 = await prisma.adLabAd.deleteMany({});
  console.log(`  ✓ Deleted ${d7.count} AdLabAd rows (+ cascaded metrics/decisions)`);

  const d8 = await prisma.adLabExperiment.updateMany({
    data: {
      status: "draft",
      metaCampaignId: null,
      campaignName: null,
      launchedAt: null,
      concludedAt: null,
      conclusionSummary: null,
    },
  });
  console.log(`  ✓ Reset ${d8.count} AdLabExperiment rows to draft`);

  // ── Step 4: Verify ───────────────────────────────────────────────
  console.log("\n=== VERIFICATION ===");
  const remaining = {
    metaSpend: await prisma.metaSpend.count(),
    redFlag: await prisma.redFlag.count(),
    waitlist: await prisma.waitlist.count(),
    socialContent: await prisma.contentPiece.count({
      where: { type: { in: ["TWITTER", "TIKTOK", "INSTAGRAM", "AD_COPY", "EMAIL", "REDDIT_DRAFT"] } },
    }),
    generationJob: await prisma.generationJob.count(),
    dashboardSnapshot: await prisma.dashboardSnapshot.count(),
    adLabAd: await prisma.adLabAd.count(),
    adLabMetric: await prisma.adLabDailyMetric.count(),
    adLabDecision: await prisma.adLabDecision.count(),
  };

  const allZero = Object.values(remaining).every((v) => v === 0);
  if (allZero) {
    console.log("  All target tables verified empty.");
  } else {
    console.error("  WARNING: Residual data found:", remaining);
  }

  // Confirm preserved data is untouched
  const preserved = {
    users: await prisma.user.count(),
    entries: await prisma.entry.count(),
    claudeLogs: await prisma.claudeCallLog.count(),
    blogPosts: await prisma.contentPiece.count({ where: { type: "BLOG" } }),
  };
  console.log(`  Users preserved:     ${preserved.users}`);
  console.log(`  Entries preserved:    ${preserved.entries}`);
  console.log(`  ClaudeLogs preserved: ${preserved.claudeLogs}`);
  console.log(`  Blog posts preserved: ${preserved.blogPosts}`);

  console.log("\nDone. Dashboard metrics will start fresh from today.");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
