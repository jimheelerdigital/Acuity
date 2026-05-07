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

  try {
    // Activate campaign
    await meta.setStatus(experiment.metaCampaignId, "campaign", "ACTIVE");

    // Activate all ad sets and ads
    for (const ad of ads) {
      if (ad.metaAdsetId) await meta.setStatus(ad.metaAdsetId, "adset", "ACTIVE");
      if (ad.metaAdId) await meta.setStatus(ad.metaAdId, "ad", "ACTIVE");

      await prisma.adLabAd.update({
        where: { id: ad.id },
        data: { status: "live", launchedAt: now },
      });
    }

    // Update experiment
    await prisma.adLabExperiment.update({
      where: { id: experimentId },
      data: { status: "live", launchedAt: now },
    });

    return NextResponse.json({ activated: ads.length });
  } catch (err) {
    return NextResponse.json(
      { error: "Activation failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
