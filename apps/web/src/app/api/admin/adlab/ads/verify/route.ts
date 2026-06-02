/**
 * POST /api/admin/adlab/ads/verify — Verify campaign/ads exist on Meta.
 * Accepts { experimentId }.
 *
 * Checks each Meta object (campaign, ad sets, ads) to confirm they
 * actually exist. Updates local status to "error" for any that don't.
 * Used by the "Verify on Meta" button and the sync check.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface VerifyResult {
  objectId: string;
  type: "campaign" | "adset" | "ad";
  exists: boolean;
  metaStatus?: string;
  metaName?: string;
  error?: string;
}

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

  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  if (!experiment.metaCampaignId) {
    return NextResponse.json({ error: "No campaign ID found" }, { status: 400 });
  }

  const results: VerifyResult[] = [];
  let statusUpdates = 0;

  // Check campaign
  const campaignCheck = await meta.verifyObjectOnMeta(experiment.metaCampaignId, "campaign");
  results.push({
    objectId: experiment.metaCampaignId,
    type: "campaign",
    exists: campaignCheck.exists,
    metaStatus: campaignCheck.status,
    metaName: campaignCheck.name,
    error: campaignCheck.error,
  });

  if (!campaignCheck.exists && experiment.status === "live") {
    // Can't set "error" — not in the enum. Revert to "draft" so it's
    // clearly not live. The verify result explains what happened.
    await prisma.adLabExperiment.update({
      where: { id: experimentId },
      data: { status: "draft" },
    });
    statusUpdates++;
  }

  // Check each ad's ad set and ad
  const ads = experiment.angles.flatMap((a) => a.creatives.flatMap((c) => c.ads));
  const checkedAdsets = new Set<string>();

  for (const ad of ads) {
    // Check ad set (once per unique ad set)
    if (ad.metaAdsetId && !checkedAdsets.has(ad.metaAdsetId)) {
      checkedAdsets.add(ad.metaAdsetId);
      const adsetCheck = await meta.verifyObjectOnMeta(ad.metaAdsetId, "adset");
      results.push({
        objectId: ad.metaAdsetId,
        type: "adset",
        exists: adsetCheck.exists,
        metaStatus: adsetCheck.status,
        metaName: adsetCheck.name,
        error: adsetCheck.error,
      });
    }

    // Check ad
    if (ad.metaAdId) {
      const adCheck = await meta.verifyObjectOnMeta(ad.metaAdId, "ad");
      results.push({
        objectId: ad.metaAdId,
        type: "ad",
        exists: adCheck.exists,
        metaStatus: adCheck.status,
        metaName: adCheck.name,
        error: adCheck.error,
      });

      // Update local status if ad doesn't exist on Meta but is marked live
      if (!adCheck.exists && ad.status === "live") {
        await prisma.adLabAd.update({
          where: { id: ad.id },
          data: { status: "killed", decisionReason: "Meta verification failed — ad not found" },
        });
        statusUpdates++;
      }
    }
  }

  const allExist = results.every((r) => r.exists);
  const summary = allExist
    ? "All objects verified on Meta"
    : `${results.filter((r) => !r.exists).length} of ${results.length} objects not found on Meta`;

  return NextResponse.json({
    verified: allExist,
    summary,
    statusUpdates,
    results,
  });
}
