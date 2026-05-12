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
  // Verify SDK loads correctly
  try {
    const mod = await import("facebook-nodejs-business-sdk");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bizSdk = (mod as any).default ?? mod;
    console.log("[adlab-launch] SDK loaded:", typeof bizSdk.FacebookAdsApi);
  } catch (err) {
    console.error("[adlab-launch] SDK failed to load:", err);
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function logMetaError(step: string, err: any) {
    console.error(`[adlab-launch] ${step} failed`);
    // Use Object.getOwnPropertyNames to capture non-enumerable properties the SDK hides
    console.error("[adlab-launch] Full error:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    console.error("[adlab-launch] Error body:", err?.response?.body || err?.body || err?.message);
    // Meta SDK sometimes puts the real error in _data
    if (err?._data) console.error("[adlab-launch] Error _data:", JSON.stringify(err._data, null, 2));
    if (err?.response) console.error("[adlab-launch] Error response:", JSON.stringify(err.response, null, 2));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function extractErrorDetail(err: any): string {
    const body = err?.response?.body || err?.body || err?._data;
    if (body) return typeof body === "string" ? body : JSON.stringify(body);
    return err?.message || String(err);
  }

  const errors: { creativeId: string; error: string }[] = [];
  const created: { creativeId: string; adId: string; adsetId: string }[] = [];

  try {
    // 1. Create campaign — use experiment-level overrides if set, fall back to project defaults
    const campaignName = (experiment as Record<string, unknown>).campaignName as string
      || `${project.slug} | exp_${experiment.id}`;
    const campaignObjective = (experiment as Record<string, unknown>).campaignObjective as string
      || project.conversionObjective;

    console.log("[adlab-launch] Creating campaign:", { campaignName, campaignObjective });

    let campaignId: string;
    try {
      campaignId = await meta.createCampaign({
        name: campaignName,
        objective: campaignObjective,
      });
      console.log("[adlab-launch] Campaign created:", campaignId);
    } catch (err) {
      logMetaError("Campaign creation", err);
      return NextResponse.json(
        { error: "Campaign creation failed", detail: extractErrorDetail(err) },
        { status: 500 }
      );
    }

    // Save campaign ID on experiment
    await prisma.adLabExperiment.update({
      where: { id: experimentId },
      data: { metaCampaignId: campaignId },
    });

    const audience = project.targetAudience as Record<string, unknown>;

    // 2. For each approved creative, create ad set + ad
    for (const creative of approvedCreatives) {
      const creativeType = (creative as Record<string, unknown>).creativeType as string || "image";
      const creativeLabel = `${creativeType} creative ${creative.id.slice(0, 8)}`;

      try {
        const adsetName = `${project.slug} | exp_${experiment.id} | ${creativeType} | ${creative.angle.valueSurface} | creative_${creative.id}`;

        const expRecord = experiment as Record<string, unknown>;
        const adsetBudget = (expRecord.adSetDailyBudgetCents as number) || project.dailyBudgetCentsPerVariant;
        const convEvent = (expRecord.optimizationEvent as string) || project.conversionEvent || "Lead";

        // Create ad set
        console.log(`[adlab-launch] Creating ad set for ${creativeLabel}:`, { adsetName, adsetBudget, convEvent });
        let adsetId: string;
        try {
          adsetId = await meta.createAdSet({
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
          console.log(`[adlab-launch] Ad set created for ${creativeLabel}:`, adsetId);
        } catch (err) {
          logMetaError(`Ad set creation for ${creativeLabel}`, err);
          errors.push({ creativeId: creative.id, error: `Ad set creation failed: ${extractErrorDetail(err)}` });
          continue;
        }

        // Upload asset based on creative type
        let imageHash: string | undefined;
        let videoId: string | undefined;

        if (creativeType === "video" && creative.videoUrl) {
          console.log(`[adlab-launch] Uploading video for ${creativeLabel}:`, creative.videoUrl);
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              videoId = await meta.uploadVideo(creative.videoUrl);
              console.log(`[adlab-launch] Video uploaded for ${creativeLabel}:`, videoId);
              break;
            } catch (vidErr) {
              logMetaError(`Video upload attempt ${attempt + 1} for ${creativeLabel}`, vidErr);
              if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 10_000));
              }
            }
          }
        } else if (creative.imageUrl) {
          console.log(`[adlab-launch] Uploading image for ${creativeLabel}:`, creative.imageUrl);
          try {
            imageHash = await meta.uploadImage(creative.imageUrl);
            console.log(`[adlab-launch] Image uploaded for ${creativeLabel}:`, imageHash);
          } catch (imgErr) {
            logMetaError(`Image upload for ${creativeLabel}`, imgErr);
          }
        }

        // Create ad creative object on Meta
        console.log(`[adlab-launch] Creating ad creative for ${creativeLabel}:`, {
          imageHash, videoId, headline: creative.headline, cta: creative.cta,
        });
        let metaCreativeId: string;
        try {
          // TODO: pageId needs to be configurable per project
          metaCreativeId = await meta.createAdCreative({
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
          console.log(`[adlab-launch] Ad creative created for ${creativeLabel}:`, metaCreativeId);
        } catch (err) {
          logMetaError(`Ad creative creation for ${creativeLabel}`, err);
          errors.push({ creativeId: creative.id, error: `Ad creative creation failed: ${extractErrorDetail(err)}` });
          continue;
        }

        // Create the ad
        console.log(`[adlab-launch] Creating ad for ${creativeLabel}`);
        let metaAdId: string;
        try {
          metaAdId = await meta.createAd({
            name: `${project.slug}_ad_${creative.id}`,
            adsetId,
            creativeId: metaCreativeId,
          });
          console.log(`[adlab-launch] Ad created for ${creativeLabel}:`, metaAdId);
        } catch (err) {
          logMetaError(`Ad creation for ${creativeLabel}`, err);
          errors.push({ creativeId: creative.id, error: `Ad creation failed: ${extractErrorDetail(err)}` });
          continue;
        }

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
        logMetaError(`Unexpected error for ${creativeLabel}`, err);
        errors.push({
          creativeId: creative.id,
          error: extractErrorDetail(err),
        });
      }
    }

    console.log(`[adlab-launch] Done. Created: ${created.length}, Errors: ${errors.length}`);

    return NextResponse.json({
      campaignId,
      campaignName,
      created,
      errors,
      status: errors.length > 0 ? "partial" : "ready",
    });
  } catch (err) {
    logMetaError("Top-level launch", err);
    return NextResponse.json(
      { error: "Campaign creation failed", detail: extractErrorDetail(err) },
      { status: 500 }
    );
  }
}
