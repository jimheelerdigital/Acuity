/**
 * POST /api/admin/adlab/ads/activate — flip campaign + all ads to ACTIVE.
 * Accepts { experimentId }.
 *
 * HARD RULE: Only callable via explicit user click. Never auto-triggered.
 *
 * Only ads still in "paused" (freshly launched) are activated — ads the
 * engine killed must never be revived by a re-click. For weekly-batch
 * experiments (evergreen ad set) the weakest live ads are retired first so
 * the ad set stays within MAX_ACTIVE_ADS.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";
import { redactAccessToken } from "@/lib/adlab/meta";
import { makeRoomInAdSet, weeklyBatchGroup } from "@/lib/adlab/evergreen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { experimentId } = await req.json();

  const experiment = await prisma.adLabExperiment.findUnique({
    where: { id: experimentId },
    include: {
      angles: {
        include: {
          creatives: {
            include: { ads: true },
          },
        },
      },
    },
  });

  if (!experiment?.metaCampaignId) {
    return NextResponse.json({ error: "No campaign found for this experiment" }, { status: 400 });
  }

  const ads = experiment.angles
    .flatMap((a) => a.creatives.flatMap((c) => c.ads))
    .filter((a) => a.status === "paused");
  const now = new Date();
  const errors: { objectId: string; type: string; error: string }[] = [];

  if (ads.length === 0) {
    return NextResponse.json({ error: "No paused ads to activate for this experiment" }, { status: 400 });
  }

  // Evergreen: retire the weakest live ads so the new ones fit.
  let retired: Array<{ adId: string; reason: string }> = [];
  if (weeklyBatchGroup(experiment.campaignTags)) {
    const adsetId = ads.find((a) => a.metaAdsetId)?.metaAdsetId;
    if (adsetId) {
      const room = await makeRoomInAdSet(adsetId, ads.length);
      retired = room.retired;
      if (room.failed.length > 0) {
        errors.push(...room.failed.map((id) => ({ objectId: id, type: "ad", error: "rotation pause failed — still live" })));
      }
    }
  }

  // Step 1: Verify campaign exists on Meta before attempting activation
  const campaignCheck = await meta.verifyObjectOnMeta(experiment.metaCampaignId, "campaign");
  if (!campaignCheck.exists) {
    return NextResponse.json(
      {
        error: "Campaign does not exist on Meta",
        detail: campaignCheck.error || "Campaign ID not found — it may have been deleted or never created",
        metaCampaignId: experiment.metaCampaignId,
      },
      { status: 400 }
    );
  }

  try {
    // Step 2: Activate campaign
    await meta.setStatus(experiment.metaCampaignId, "campaign", "ACTIVE");

    // Step 3: Verify campaign is actually ACTIVE
    const campaignVerify = await meta.verifyObjectOnMeta(experiment.metaCampaignId, "campaign");
    if (!campaignVerify.exists || (campaignVerify.status !== "ACTIVE" && campaignVerify.status !== "PENDING_REVIEW")) {
      return NextResponse.json(
        {
          error: "Campaign activation failed — Meta did not accept the status change",
          detail: `Status after activation: ${campaignVerify.status || "unknown"}`,
          metaCampaignId: experiment.metaCampaignId,
        },
        { status: 500 }
      );
    }

    // Step 4: Activate all ad sets and ads, verifying each
    let activatedCount = 0;
    for (const ad of ads) {
      try {
        if (ad.metaAdsetId) await meta.setStatus(ad.metaAdsetId, "adset", "ACTIVE");
        if (ad.metaAdId) await meta.setStatus(ad.metaAdId, "ad", "ACTIVE");

        // Verify the ad is actually active on Meta
        if (ad.metaAdId) {
          const adCheck = await meta.verifyObjectOnMeta(ad.metaAdId, "ad");
          if (!adCheck.exists) {
            errors.push({ objectId: ad.metaAdId, type: "ad", error: "Ad does not exist on Meta" });
            await prisma.adLabAd.update({
              where: { id: ad.id },
              data: { status: "killed", decisionReason: "Meta verification failed — object not found" },
            });
            continue;
          }
        }

        await prisma.adLabAd.update({
          where: { id: ad.id },
          data: { status: "live", launchedAt: now },
        });
        activatedCount++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push({
          objectId: ad.metaAdId || ad.id,
          type: "ad",
          error: redactAccessToken(errMsg),
        });
        await prisma.adLabAd.update({
          where: { id: ad.id },
          data: { status: "killed", decisionReason: `Activation failed: ${redactAccessToken(errMsg)}`.slice(0, 500) },
        });
      }
    }

    // Only mark experiment as live if at least one ad activated successfully
    if (activatedCount > 0) {
      await prisma.adLabExperiment.update({
        where: { id: experimentId },
        data: { status: "live", launchedAt: now },
      });
    } else {
      return NextResponse.json(
        { error: "No ads could be activated on Meta", errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      activated: activatedCount,
      retired: retired.length,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Activation failed", detail: err instanceof Error ? redactAccessToken(err.message) : String(err) },
      { status: 500 }
    );
  }
}
