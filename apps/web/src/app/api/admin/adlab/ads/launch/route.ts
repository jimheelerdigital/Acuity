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
import { redactAccessToken } from "@/lib/adlab/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Truncate a string to a readable slug for Meta object names. */
function slug(text: string, maxLen = 40): string {
  return text.replace(/[^a-zA-Z0-9 ]+/g, "").trim().replace(/\s+/g, " ").slice(0, maxLen).trim();
}

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

  // Check compliance — only "fail" status blocks launch. "pass" and "warning" both proceed.
  const failedCompliance = approvedCreatives.filter((c) => c.complianceStatus === "fail");
  const launchableCreatives = approvedCreatives.filter((c) => c.complianceStatus !== "fail");

  if (launchableCreatives.length === 0) {
    return NextResponse.json(
      {
        error: "Cannot launch — all approved creatives failed compliance. Edit the copy or generate new variants.",
        ids: failedCompliance.map((c) => c.id),
      },
      { status: 400 }
    );
  }

  // Log if some creatives were skipped
  if (failedCompliance.length > 0) {
    console.log(`[adlab-launch] Skipping ${failedCompliance.length} creative(s) that failed compliance: ${failedCompliance.map((c) => c.id).join(", ")}`);
  }

  const isAppInstall = (experiment as Record<string, unknown>).campaignType === "app_install";

  if (!project.metaAdAccountId) {
    return NextResponse.json(
      { error: "Project missing Meta Ad Account ID" },
      { status: 400 }
    );
  }

  if (!isAppInstall && !project.metaPixelId) {
    return NextResponse.json(
      { error: "Project missing Meta Pixel ID (required for website conversion campaigns)" },
      { status: 400 }
    );
  }

  const metaPageId = (project as Record<string, unknown>).metaPageId as string | null;
  const landingPageUrl = (project as Record<string, unknown>).landingPageUrl as string | null;
  const metaAppId = (project as Record<string, unknown>).metaAppId as string | null;

  // Fail fast: validate required fields before any Meta API calls
  const missingFields: string[] = [];
  if (!metaPageId) missingFields.push("metaPageId (Facebook Page ID)");
  if (isAppInstall) {
    if (!metaAppId) missingFields.push("metaAppId (Meta App ID from developers.facebook.com)");
  } else {
    if (!landingPageUrl) missingFields.push("landingPageUrl");
  }
  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Project missing required fields: ${missingFields.join(", ")}. Update in project settings before launching.` },
      { status: 400 }
    );
  }

  const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function logMetaError(step: string, err: any) {
    console.error(`[adlab-launch] ${step} failed`);
    // Use Object.getOwnPropertyNames to capture non-enumerable properties the SDK hides
    // Redact access_token from all logged strings to prevent token leaks
    try {
      console.error("[adlab-launch] Full error:", redactAccessToken(JSON.stringify(err, Object.getOwnPropertyNames(err), 2)));
    } catch { console.error("[adlab-launch] Full error:", redactAccessToken(String(err))); }
    const body = err?.response?.body || err?.body || err?.message;
    if (body) console.error("[adlab-launch] Error body:", redactAccessToken(typeof body === "string" ? body : JSON.stringify(body)));
    if (err?._data) console.error("[adlab-launch] Error _data:", redactAccessToken(JSON.stringify(err._data, null, 2)));
    if (err?.response) console.error("[adlab-launch] Error response:", redactAccessToken(JSON.stringify(err.response, null, 2)));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function extractErrorDetail(err: any): string {
    const body = err?.response?.body || err?.body || err?._data;
    const raw = body ? (typeof body === "string" ? body : JSON.stringify(body)) : (err?.message || String(err));
    return redactAccessToken(raw);
  }

  // Clean up orphaned campaign: if experiment has a metaCampaignId but zero ads with metaAdsetId,
  // the prior launch failed mid-way. Delete the orphan from Meta and clear it before retrying.
  const existingCampaignId = (experiment as Record<string, unknown>).metaCampaignId as string | null;
  if (existingCampaignId) {
    const adsWithAdsets = await prisma.adLabAd.count({
      where: {
        metaCampaignId: existingCampaignId,
        metaAdsetId: { not: null },
      },
    });
    if (adsWithAdsets === 0) {
      console.log("[adlab-launch] Cleaning up orphaned campaign:", existingCampaignId);
      try {
        await meta.deleteCampaign(existingCampaignId);
      } catch (err) {
        console.warn("[adlab-launch] Failed to delete orphaned campaign (may already be gone):", redactAccessToken(String(err)));
      }
      await prisma.adLabExperiment.update({
        where: { id: experimentId },
        data: { metaCampaignId: null },
      });
    }
  }

  const errors: { creativeId: string; error: string }[] = [];
  const created: { creativeId: string; adId: string; adsetId: string }[] = [];

  try {
    // 1. Create campaign — use experiment-level overrides if set, fall back to project defaults
    const topicSlug = slug(experiment.topicBrief, 50);
    const month = new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const campaignName = (experiment as Record<string, unknown>).campaignName as string
      || `${project.name} | ${topicSlug} | ${month}`;
    const campaignObjective = isAppInstall
      ? "OUTCOME_APP_PROMOTION"
      : ((experiment as Record<string, unknown>).campaignObjective as string || project.conversionObjective);

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

    // 2. For each launchable creative (pass or warning), create ad set + ad
    for (const creative of launchableCreatives) {
      const creativeType = (creative as Record<string, unknown>).creativeType as string || "image";
      const creativeLabel = `${creativeType} creative ${creative.id.slice(0, 8)}`;

      try {
        const angleSlug = slug(creative.angle.hypothesis, 50);
        const surface = creative.angle.valueSurface;
        const adsetName = `${project.name} | ${topicSlug} | ${surface}: ${angleSlug} | ${creativeType}`;

        const expRecord = experiment as Record<string, unknown>;
        const adsetBudget = (expRecord.adSetDailyBudgetCents as number) || project.dailyBudgetCentsPerVariant;
        const convEvent = (expRecord.optimizationEvent as string) || project.conversionEvent || "Lead";

        // Create ad set
        console.log(`[adlab-launch] Creating ad set for ${creativeLabel}:`, { adsetName, adsetBudget, convEvent });
        let adsetId: string;
        try {
          const projectInterests = (project as Record<string, unknown>).targetInterests as { id: string; name: string }[] | null;
          const placementType = (expRecord.placementType as string) || null;
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
            targetInterests: projectInterests || undefined,
            placementType,
            ...(isAppInstall && metaAppId
              ? {
                  appInstall: {
                    applicationId: metaAppId,
                    objectStoreUrl: APP_STORE_URL,
                  },
                }
              : {}),
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
          if (!videoId) {
            errors.push({ creativeId: creative.id, error: "Video upload failed after 2 attempts" });
            continue;
          }
        } else if (creative.imageUrl) {
          console.log(`[adlab-launch] Uploading image for ${creativeLabel}:`, creative.imageUrl);
          try {
            imageHash = await meta.uploadImage(creative.imageUrl);
            console.log(`[adlab-launch] Image uploaded for ${creativeLabel}:`, imageHash);
          } catch (imgErr) {
            logMetaError(`Image upload for ${creativeLabel}`, imgErr);
          }
          if (!imageHash) {
            errors.push({ creativeId: creative.id, error: "Image upload failed — skipping creative to avoid ad with no image" });
            continue;
          }
        }

        // Create ad creative object on Meta
        console.log(`[adlab-launch] Creating ad creative for ${creativeLabel}:`, {
          imageHash, videoId, headline: creative.headline, cta: creative.cta,
        });
        let metaCreativeId: string;
        try {
          // App install: link to App Store directly (no UTMs — App Store ignores them)
          // Website: link to landing page with UTM params for GA4 tracking
          let adLinkUrl: string;
          if (isAppInstall) {
            adLinkUrl = APP_STORE_URL;
          } else {
            const linkUrl = new URL(landingPageUrl!);
            linkUrl.searchParams.set("utm_source", "meta");
            linkUrl.searchParams.set("utm_medium", "paid");
            linkUrl.searchParams.set("utm_campaign", experiment.id);
            linkUrl.searchParams.set("utm_content", creative.id);
            adLinkUrl = linkUrl.toString();
          }

          metaCreativeId = await meta.createAdCreative({
            name: `${project.name} | ${surface}: ${angleSlug} | "${slug(creative.headline, 40)}"`,
            pageId: metaPageId!,
            imageHash,
            videoId,
            headline: creative.headline,
            primaryText: creative.primaryText,
            description: creative.description,
            cta: isAppInstall ? "DOWNLOAD" : creative.cta,
            linkUrl: adLinkUrl,
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
            name: `${project.name} | ${angleSlug} | "${slug(creative.headline, 40)}"`,
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

    // If ALL ad sets failed, delete the orphaned campaign from Meta and clear the reference
    if (created.length === 0 && errors.length > 0) {
      console.log("[adlab-launch] All ad sets failed — deleting orphaned campaign:", campaignId);
      try {
        await meta.deleteCampaign(campaignId);
      } catch (delErr) {
        console.warn("[adlab-launch] Failed to delete orphaned campaign:", redactAccessToken(String(delErr)));
      }
      await prisma.adLabExperiment.update({
        where: { id: experimentId },
        data: { metaCampaignId: null },
      });
      return NextResponse.json(
        { error: "All ad sets failed to create — campaign deleted", errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      campaignId,
      campaignName,
      created,
      errors,
      complianceSkipped: failedCompliance.length,
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
