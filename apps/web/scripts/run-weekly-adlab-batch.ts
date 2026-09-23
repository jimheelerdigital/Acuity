/**
 * Manual run of the weekly Reddit→AdLab ad batch (2026-09-23, per Keenan).
 *
 * Same pipeline as the adlab-weekly-batch Inngest cron, run locally against
 * prod because INNGEST_EVENT_KEY isn't pullable locally and Keenan wants
 * this week's batch NOW instead of waiting for Sunday.
 *
 * Per group (women, men): createBatchForGroup → generateBatchImage per
 * creative → runComplianceForExperiment. One review email at the end.
 * Groups soft-fail independently, mirroring the Inngest function.
 *
 * NOTHING here touches Meta — experiments land as awaiting_approval and
 * launch only happens from /admin/adlab/review.
 *
 * Run from apps/web so the "@/..." alias + .env resolve:
 *   cd apps/web && npx tsx scripts/run-weekly-adlab-batch.ts
 *
 * ⚠️ 2026-09-23: BOTH local ANTHROPIC_API_KEYs (.env.local and root .env)
 * are stale — every Claude call 401s, so this script fails locally. The
 * valid key lives only in Vercel (marked sensitive, unpullable). Use the
 * prod trigger instead:
 *   curl -X POST https://goripple.io/api/admin/adlab/run-weekly-batch \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */

// Load env BEFORE any "@/..." import so prisma is built with valid creds.
import "./load-env";

import {
  BATCH_GROUPS,
  createBatchForGroup,
  generateBatchImage,
  sendWeeklyBatchEmail,
  type BatchGroupKey,
  type GroupBatchSummary,
} from "@/lib/adlab/weekly-batch";
import { runComplianceForExperiment } from "@/lib/adlab/compliance";
import { prisma } from "@/lib/prisma";

async function runGroup(groupKey: BatchGroupKey): Promise<GroupBatchSummary> {
  try {
    console.log(`\n=== ${groupKey}: creating batch ===`);
    const { experimentId, creativeIds, digestDate } = await createBatchForGroup(groupKey);

    let imagesOk = 0;
    for (const [i, id] of creativeIds.entries()) {
      process.stdout.write(`  image ${i + 1}/${creativeIds.length}... `);
      const res = await generateBatchImage(id);
      console.log(res.ok ? "ok" : `FAILED: ${res.error}`);
      if (res.ok) imagesOk++;
    }

    console.log(`  compliance...`);
    const compliance = await runComplianceForExperiment(experimentId);
    console.log(
      `  compliance: ${compliance.passCount} pass / ${compliance.warnCount} warn / ${compliance.failCount} fail`
    );

    const creatives = await prisma.adLabCreative.findMany({
      where: { id: { in: creativeIds } },
      select: { headline: true },
    });

    return {
      groupKey,
      experimentId,
      digestDate,
      creativeCount: creativeIds.length,
      imagesOk,
      compliance: {
        passCount: compliance.passCount,
        warnCount: compliance.warnCount,
        failCount: compliance.failCount,
      },
      headlines: creatives.map((c) => c.headline),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ${groupKey} FAILED: ${msg}`);
    return {
      groupKey,
      experimentId: "",
      digestDate: "",
      creativeCount: 0,
      imagesOk: 0,
      compliance: { passCount: 0, warnCount: 0, failCount: 0 },
      headlines: [],
      error: msg,
    };
  }
}

async function main() {
  const summaries: GroupBatchSummary[] = [];
  for (const key of Object.keys(BATCH_GROUPS) as BatchGroupKey[]) {
    summaries.push(await runGroup(key));
  }

  console.log(`\n=== sending review email ===`);
  await sendWeeklyBatchEmail(summaries);

  console.log(`\n=== DONE ===`);
  for (const s of summaries) {
    if (s.error) console.log(`${s.groupKey}: FAILED — ${s.error}`);
    else
      console.log(
        `${s.groupKey}: ${s.creativeCount} ads, ${s.imagesOk} images, compliance ${s.compliance.passCount}p/${s.compliance.warnCount}w/${s.compliance.failCount}f (exp ${s.experimentId})`
      );
  }
  const anyFail = summaries.some((s) => s.error);
  process.exit(anyFail ? 1 : 0);
}

main();
