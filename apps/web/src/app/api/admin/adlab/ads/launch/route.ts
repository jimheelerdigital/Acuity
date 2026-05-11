/**
 * POST /api/admin/adlab/ads/launch — create Meta campaign + ad sets + ads in PAUSED state.
 * Accepts { experimentId }.
 *
 * HARD RULE: This endpoint creates everything PAUSED. The user must explicitly click
 * "Launch Live" to activate. Never auto-launch on creative approval.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { experimentId } = await req.json();
  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }

  const experiment = await prisma.adLabExperiment.findUnique({
    where: { id: experimentId },
    include: {
      project: true,
      angles: {
        include: {
          creatives: {
            where: { approved: true },
          },
        },
      },
    },
  });

  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  const project = experiment.project;
  const approvedCreatives = experiment.angles.flatMap((a) =>
    a.creatives.map((c) => ({ ...c, angle: a }))
  );

  if (approvedCreatives.length === 0) {
    return NextResponse.json({ error: "No approved creatives" }, { status: 400 });
  }

  // Check compliance
  const nonCompliant = approvedCreatives.filter((c) => c.complianceStatus !== "passed");
  if (nonCompliant.length > 0) {
    return NextResponse.json(
      {
        error: "Cannot launch — some approved creatives have not passed compliance",
        ids: nonCompliant.map((c) => c.id),
      },
      { status: 400 }
    );
  }

  if (!project.metaAdAccountId || !project.metaPixelId) {
    return NextResponse.json(
      { error: "Project missing Meta Ad Account ID or Pixel ID" },
      { status: 400 }
    );
  }

  const errors: { creativeId: string; error: string }[] = [];
  const created: { creativeId: string; adId: string; adsetId: string }[] = [];

  try {
    // 1. Create campaign — use experiment-level overrides if set, fall back to project defaults
    const campaignName = (experiment as Record<string, unknown>).campaignName as string
      || `${project.slug} | exp_${experiment.id}`;
    const campaignObjective = (experiment as Record<string, unknown>).campaignObjective as string
      || project.conversionObjective;
    const campaignId = await meta.createCampaign({
      name: campaignName,
      objective: campaignObjective,
    });

    // Save campaign ID on experiment
    await prisma.adLabExperiment.update({
      where: { id: experimentId },
      data: { metaCampaignId: campaignId },
    });

    const audience = project.targetAudience as Record<string, unknown>;

    // 2. For each approved creative, create ad set + ad
    for (const creative of approvedCreatives) {
      try {
        const creativeType = (creative as Record<string, unknown>).creativeType as string || "image";
        const adsetName = `${project.slug} | exp_${experiment.id} | ${creativeType} | ${creative.angle.valueSurface} | creative_${creative.id}`;

        const expRecord = experiment as Record<string, unknown>;
        const adsetBudget = (expRecord.adSetDailyBudgetCents as number) || project.dailyBudgetCentsPerVariant;
        const convEvent = (expRecord.optimizationEvent as string) || project.conversionEvent || "Lead";

        const adsetId = await meta.createAdSet({
          campaignId,
          name: adsetName,
          dailyBudgetCents: adsetBudget,
          pixelId: project.metaPixelId!,
          conversionEvent: convEvent,
          targetAudience: {
            ageMin: (audience.ageMin as number) || 25,
            ageMax: (audience.ageMax as number) || 55,
            geo: (audience.geo as string[]) || ["US"],
          },
        });

        // Upload asset based on creative type
        let imageHash: string | undefined;
        let videoId: string | undefined;

        if (creativeType === "video" && creative.videoUrl) {
          // Upload video to Meta — retry once on failure (common for video processing)
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              videoId = await meta.uploadVideo(creative.videoUrl);
              break;
            } catch (vidErr) {
              if (attempt === 0) {
                console.warn("[adlab] Video upload attempt 1 failed, retrying in 10s:", vidErr);
                await new Promise((r) => setTimeout(r, 10_000));
              } else {
                console.error("[adlab] Video upload failed after retry:", vidErr);
              }
            }
          }
        } else if (creative.imageUrl) {
          try {
            imageHash = await meta.uploadImage(creative.imageUrl);
          } catch (imgErr) {
            console.warn("[adlab] Image upload failed:", imgErr);
          }
        }

        // Create ad creative object on Meta
        // TODO: pageId needs to be configurable per project
        const metaCreativeId = await meta.createAdCreative({
          name: `${project.slug}_creative_${creative.id}`,
          pageId: "", // TODO: add pageId to project config
          imageHash,
          videoId,
          headline: creative.headline,
          primaryText: creative.primaryText,
          description: creative.description,
          cta: creative.cta,
          linkUrl: `https://getacuity.io?utm_source=meta&utm_medium=paid&utm_campaign=${experiment.id}&utm_content=${creative.id}`,
        });

        // Create the ad
        const metaAdId = await meta.createAd({
          name: `${project.slug}_ad_${creative.id}`,
          adsetId,
          creativeId: metaCreativeId,
        });

        // Save to database
        await prisma.adLabAd.create({
          data: {
            creativeId: creative.id,
            metaCampaignId: campaignId,
            metaAdsetId: adsetId,
            metaAdId,
            status: "paused",
            dailyBudgetCents: project.dailyBudgetCentsPerVariant,
          },
        });

        created.push({ creativeId: creative.id, adId: metaAdId, adsetId });
      } catch (err) {
        errors.push({
          creativeId: creative.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      campaignId,
      campaignName,
      created,
      errors,
      status: errors.length > 0 ? "partial" : "ready",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Campaign creation failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
