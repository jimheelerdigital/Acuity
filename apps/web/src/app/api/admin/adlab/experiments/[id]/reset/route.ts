/**
 * POST /api/admin/adlab/experiments/[id]/reset — reset experiment to draft.
 * Deletes Meta campaign if exists, removes all AdLabAd records, sets status to draft.
 * Preserves angles and creatives so the experiment can be re-launched.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const experiment = await prisma.adLabExperiment.findUnique({
    where: { id: params.id },
  });

  if (!experiment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete Meta campaign if one exists
  if (experiment.metaCampaignId) {
    try {
      const meta = await import("@/lib/adlab/meta");
      await meta.deleteCampaign(experiment.metaCampaignId);
    } catch (err) {
      const { redactAccessToken } = await import("@/lib/adlab/meta");
      console.warn(
        "[adlab] Campaign delete failed (may already be deleted):",
        redactAccessToken(String(err))
      );
    }
  }

  // Delete all ad records for this experiment (cascade handles metrics/decisions)
  const creativeIds = await prisma.adLabCreative.findMany({
    where: { angle: { experimentId: params.id } },
    select: { id: true },
  });

  if (creativeIds.length > 0) {
    await prisma.adLabAd.deleteMany({
      where: { creativeId: { in: creativeIds.map((c) => c.id) } },
    });
  }

  // Reset experiment to draft
  await prisma.adLabExperiment.update({
    where: { id: params.id },
    data: {
      status: "draft",
      metaCampaignId: null,
      campaignName: null,
      launchedAt: null,
      concludedAt: null,
      conclusionSummary: null,
    },
  });

  return NextResponse.json({ reset: true });
}
