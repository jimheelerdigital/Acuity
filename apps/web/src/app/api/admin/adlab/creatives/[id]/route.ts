/**
 * PUT /api/admin/adlab/creatives/[id] — update creative (approve, edit copy, etc.)
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_APPROVED_PER_BATCH = 2;

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const allowedFields = [
    "headline",
    "primaryText",
    "description",
    "cta",
    "approved",
    "complianceStatus",
    "complianceNotes",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key];
  }

  // Weekly batches (2026-09-29, per Keenan): he picks at most TWO ads per
  // lane per week to test. Block approving a third in the same batch.
  // Video ads (2026-09-29) are counted separately: up to 2 image + 2 video.
  if (data.approved === true) {
    const c = await prisma.adLabCreative.findUnique({
      where: { id: params.id },
      select: { approved: true, creativeType: true, angle: { select: { experimentId: true, experiment: { select: { campaignTags: true } } } } },
    });
    if (c && !c.approved && c.angle.experiment.campaignTags.includes("weekly-reddit-batch")) {
      const already = await prisma.adLabCreative.count({
        where: { approved: true, creativeType: c.creativeType, angle: { experimentId: c.angle.experimentId } },
      });
      if (already >= MAX_APPROVED_PER_BATCH) {
        return NextResponse.json(
          { error: `You can pick at most ${MAX_APPROVED_PER_BATCH} ${c.creativeType === "video" ? "video" : "image"} ads per lane each week. Unapprove one first.` },
          { status: 400 }
        );
      }
    }
  }

  const updated = await prisma.adLabCreative.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(updated);
}
