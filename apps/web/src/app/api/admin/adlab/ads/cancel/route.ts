/**
 * POST /api/admin/adlab/ads/cancel — delete campaign and reset experiment.
 * Accepts { experimentId }.
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
  });

  if (!experiment?.metaCampaignId) {
    return NextResponse.json({ error: "No campaign to cancel" }, { status: 400 });
  }

  try {
    await meta.deleteCampaign(experiment.metaCampaignId);
  } catch (err) {
    const { redactAccessToken } = await import("@/lib/adlab/meta");
    console.warn("[adlab] Campaign delete failed (may already be deleted):", redactAccessToken(String(err)));
  }

  // Delete local ad records
  await prisma.adLabAd.deleteMany({
    where: { metaCampaignId: experiment.metaCampaignId },
  });

  // Reset experiment
  await prisma.adLabExperiment.update({
    where: { id: experimentId },
    data: {
      status: "awaiting_approval",
      metaCampaignId: null,
      launchedAt: null,
    },
  });

  return NextResponse.json({ cancelled: true });
}
