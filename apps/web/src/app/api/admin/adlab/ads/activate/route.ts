/**
 * POST /api/admin/adlab/ads/activate — flip campaign + all ads to ACTIVE.
 * Accepts { experimentId }.
 *
 * HARD RULE: Only callable via explicit user click. Never auto-triggered.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";
import { redactAccessToken } from "@/lib/adlab/meta";

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

  const ads = experiment.angles.flatMap((a) => a.creatives.flatMap((c) => c.ads));
  const now = new Date();
  const errors: { objectId: string; type: string; error: string }[] = [];

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
          data: { status: "killed", decisionReason: "Meta verification failed — object not found" },
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
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Activation failed", detail: err instanceof Error ? redactAccessToken(err.message) : String(err) },
      { status: 500 }
    );
  }
}
