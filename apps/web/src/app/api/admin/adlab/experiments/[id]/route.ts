/**
 * GET    /api/admin/adlab/experiments/[id] — get experiment with angles
 * PATCH  /api/admin/adlab/experiments/[id] — update launch settings
 *        (budget, destination, destinationUrl, campaignType)
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
        project: { select: { name: true, slug: true, landingPageUrl: true } },
        landingPage: true,
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
        project: { select: { name: true, slug: true, landingPageUrl: true } },
        landingPage: true,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.adSetDailyBudgetCents !== undefined) {
    const cents = Number(body.adSetDailyBudgetCents);
    if (!Number.isInteger(cents) || cents < 100) {
      return NextResponse.json(
        { error: "adSetDailyBudgetCents must be an integer >= 100 ($1/day minimum)" },
        { status: 400 }
      );
    }
    data.adSetDailyBudgetCents = cents;
  }

  if (body.destination !== undefined) {
    if (!["direct_funnel", "landing_page", "custom_url"].includes(body.destination)) {
      return NextResponse.json(
        { error: "destination must be direct_funnel, landing_page, or custom_url" },
        { status: 400 }
      );
    }
    data.destination = body.destination;
  }

  if (body.destinationUrl !== undefined) {
    if (body.destinationUrl === null || body.destinationUrl === "") {
      data.destinationUrl = null;
    } else {
      try {
        const parsed = new URL(String(body.destinationUrl));
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");
        data.destinationUrl = parsed.toString();
      } catch {
        return NextResponse.json(
          { error: "destinationUrl must be a valid http(s) URL" },
          { status: 400 }
        );
      }
    }
  }

  if (body.campaignType !== undefined) {
    if (!["website", "app_install"].includes(body.campaignType)) {
      return NextResponse.json(
        { error: "campaignType must be website or app_install" },
        { status: 400 }
      );
    }
    data.campaignType = body.campaignType;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const experiment = await prisma.adLabExperiment.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(experiment);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
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
