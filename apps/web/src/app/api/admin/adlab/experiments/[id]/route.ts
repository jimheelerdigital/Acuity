/**
 * GET    /api/admin/adlab/experiments/[id] — get experiment with angles
 * DELETE /api/admin/adlab/experiments/[id] — delete experiment and all related data
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  // Try with referenceImages first; fall back without if the table doesn't exist yet
  let experiment;
  try {
    experiment = await prisma.adLabExperiment.findUnique({
      where: { id: params.id },
      include: {
        project: { select: { name: true, slug: true } },
        referenceImages: { orderBy: { createdAt: "asc" } },
        angles: {
          include: {
            creatives: {
              include: {
                ads: {
                  include: {
                    metrics: true,
                  },
                },
              },
            },
          },
          orderBy: { score: "desc" },
        },
      },
    });
  } catch {
    // referenceImages table may not exist yet — query without it
    experiment = await prisma.adLabExperiment.findUnique({
      where: { id: params.id },
      include: {
        project: { select: { name: true, slug: true } },
        angles: {
          include: {
            creatives: {
              include: {
                ads: {
                  include: {
                    metrics: true,
                  },
                },
              },
            },
          },
          orderBy: { score: "desc" },
        },
      },
    });
    // Attach empty referenceImages so the UI doesn't break
    if (experiment) {
      (experiment as Record<string, unknown>).referenceImages = [];
    }
  }

  if (!experiment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(experiment);
}

export async function DELETE(
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

  // Delete Meta campaign first if one exists
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

  // Cascade delete handles: angles → creatives → ads → metrics/decisions, plus reference images
  await prisma.adLabExperiment.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ deleted: true });
}
