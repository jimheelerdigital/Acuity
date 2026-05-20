/**
 * Wipes all AdLab performance/metrics data while preserving creative assets,
 * experiment templates, angles, landing pages, and reference images.
 *
 * WHAT GETS DELETED:
 *   - All AdLabDailyMetric rows (impressions, clicks, spend, conversions, etc.)
 *   - All AdLabDecision rows (kill/scale/maintain audit log)
 *   - All AdLabAd rows (Meta ad records — cascade deletes metrics + decisions)
 *
 * WHAT GETS RESET (not deleted):
 *   - All experiments: status → "draft", campaign fields nulled
 *
 * WHAT IS PRESERVED:
 *   - AdLabProject (config, brand voice, target audience, learned patterns)
 *   - AdLabExperiment (topic briefs — only campaign/status fields reset)
 *   - AdLabAngle (hypotheses, personas, research notes, video scripts)
 *   - AdLabCreative (ad copy, images, compliance status)
 *   - AdLabReferenceImage (visual inspiration)
 *   - AdLabLandingPage (generated landing pages)
 *
 * DOES NOT TOUCH:
 *   - User table or any user data whatsoever
 *
 * Usage:
 *   # Dry run (default — counts what would be deleted, changes nothing):
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/reset-adlab-metrics.ts
 *
 *   # Execute:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/reset-adlab-metrics.ts --yes
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const execute = process.argv.includes("--yes");

async function main() {
  console.log(execute ? "🔴 LIVE RUN — changes will be committed" : "🟡 DRY RUN — no changes will be made\n");

  // Count what exists
  const metricCount = await prisma.adLabDailyMetric.count();
  const decisionCount = await prisma.adLabDecision.count();
  const adCount = await prisma.adLabAd.count();
  const experimentCount = await prisma.adLabExperiment.count();
  const liveExperiments = await prisma.adLabExperiment.count({
    where: { status: { not: "draft" } },
  });

  // Preserved counts
  const projectCount = await prisma.adLabProject.count();
  const angleCount = await prisma.adLabAngle.count();
  const creativeCount = await prisma.adLabCreative.count();
  const refImageCount = await prisma.adLabReferenceImage.count();
  const landingPageCount = await prisma.adLabLandingPage.count();

  console.log("=== WILL BE DELETED ===");
  console.log(`  AdLabDailyMetric rows:  ${metricCount}`);
  console.log(`  AdLabDecision rows:     ${decisionCount}`);
  console.log(`  AdLabAd rows:           ${adCount}`);
  console.log(`  Experiments to reset:   ${liveExperiments} of ${experimentCount} total`);
  console.log("");
  console.log("=== WILL BE PRESERVED ===");
  console.log(`  AdLabProject:           ${projectCount}`);
  console.log(`  AdLabExperiment:        ${experimentCount} (reset to draft, not deleted)`);
  console.log(`  AdLabAngle:             ${angleCount}`);
  console.log(`  AdLabCreative:          ${creativeCount}`);
  console.log(`  AdLabReferenceImage:    ${refImageCount}`);
  console.log(`  AdLabLandingPage:       ${landingPageCount}`);

  if (!execute) {
    console.log("\nPass --yes to execute. Nothing was changed.");
    return;
  }

  console.log("\nExecuting...");

  // Step 1: Delete all ads (cascades to metrics + decisions)
  const deletedAds = await prisma.adLabAd.deleteMany({});
  console.log(`  Deleted ${deletedAds.count} AdLabAd rows (+ cascaded metrics/decisions)`);

  // Step 2: Reset all experiments to draft
  const resetExperiments = await prisma.adLabExperiment.updateMany({
    data: {
      status: "draft",
      metaCampaignId: null,
      campaignName: null,
      launchedAt: null,
      concludedAt: null,
      conclusionSummary: null,
    },
  });
  console.log(`  Reset ${resetExperiments.count} experiments to draft`);

  // Step 3: Verify cleanup
  const remainingMetrics = await prisma.adLabDailyMetric.count();
  const remainingDecisions = await prisma.adLabDecision.count();
  const remainingAds = await prisma.adLabAd.count();

  if (remainingMetrics === 0 && remainingDecisions === 0 && remainingAds === 0) {
    console.log("\nAll performance data wiped successfully.");
  } else {
    console.error(`\nWARNING: Residual data found — metrics: ${remainingMetrics}, decisions: ${remainingDecisions}, ads: ${remainingAds}`);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
