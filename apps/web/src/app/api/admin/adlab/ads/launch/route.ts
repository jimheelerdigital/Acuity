/**
 * POST /api/admin/adlab/ads/launch — create Meta campaign + ad set + ads in PAUSED state.
 * Accepts { experimentId }.
 *
 * Structure: 1 campaign → 1 ad set → N ads (one per creative).
 * Meta's algorithm distributes spend to the best-performing ads within the ad set.
 *
 * HARD RULE: This endpoint creates everything PAUSED. The user must explicitly click
 * "Launch Live" to activate. Never auto-launch on creative approval.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";
import { redactAccessToken } from "@/lib/adlab/meta";
import { generateLandingPage } from "@/lib/adlab/landing-page";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — launching many creatives takes time with rate limiting

/** Truncate a string to a readable slug for Meta object names. */
function slug(text: string, maxLen = 40): string {
  return text.replace(/[^a-zA-Z0-9 ]+/g, "").trim().replace(/\s+/g, " ").slice(0, maxLen).trim();
}

/** Delay helper for rate limiting between Meta API calls */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retry a function up to maxRetries times with a delay between retries */
async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, retryDelayMs = 3000, label = "API call" }: { maxRetries?: number; retryDelayMs?: number; label?: string } = {}
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`[adlab-launch] ${label} failed (attempt ${attempt}/${maxRetries}), retrying in ${retryDelayMs}ms...`);
      await delay(retryDelayMs);
    }
  }
  throw new Error("unreachable");
}

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
      landingPage: true,
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

  // Check compliance — only "fail" status blocks launch
  const failedCompliance = approvedCreatives.filter((c) => c.complianceStatus === "fail");
  const launchableCreatives = approvedCreatives.filter((c) => c.complianceStatus !== "fail");

  if (launchableCreatives.length === 0) {
    return NextResponse.json(
      { error: "Cannot launch — all approved creatives failed compliance.", ids: failedCompliance.map((c) => c.id) },
      { status: 400 }
    );
  }

  if (failedCompliance.length > 0) {
    console.log(`[adlab-launch] Skipping ${failedCompliance.length} compliance-failed creative(s)`);
  }

  const isAppInstall = (experiment as Record<string, unknown>).campaignType === "app_install";

  if (!project.metaAdAccountId) {
    return NextResponse.json({ error: "Project missing Meta Ad Account ID" }, { status: 400 });
  }
  if (!isAppInstall && !project.metaPixelId) {
    return NextResponse.json({ error: "Project missing Meta Pixel ID" }, { status: 400 });
  }

  const metaPageId = (project as Record<string, unknown>).metaPageId as string | null;
  const landingPageUrl = (project as Record<string, unknown>).landingPageUrl as string | null;
  const metaAppId = (project as Record<string, unknown>).metaAppId as string | null;

  const missingFields: string[] = [];
  if (!metaPageId) missingFields.push("metaPageId");
  if (isAppInstall && !metaAppId) missingFields.push("metaAppId");
  if (!isAppInstall && !landingPageUrl) missingFields.push("landingPageUrl");
  if (missingFields.length > 0) {
    return NextResponse.json({ error: `Project missing: ${missingFields.join(", ")}` }, { status: 400 });
  }

  const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function logMetaError(step: string, err: any) {
    console.error(`[adlab-launch] ${step} failed`);
    try {
      console.error("[adlab-launch] Full error:", redactAccessToken(JSON.stringify(err, Object.getOwnPropertyNames(err), 2)));
    } catch { console.error("[adlab-launch] Full error:", redactAccessToken(String(err))); }
    const body = err?.response?.body || err?.body || err?.message;
    if (body) console.error("[adlab-launch] Error body:", redactAccessToken(typeof body === "string" ? body : JSON.stringify(body)));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function extractErrorDetail(err: any): string {
    const body = err?.response?.body || err?.body || err?._data;
    const raw = body ? (typeof body === "string" ? body : JSON.stringify(body)) : (err?.message || String(err));
    return redactAccessToken(raw);
  }

  // Clean up orphaned campaign from a prior failed launch
  const existingCampaignId = (experiment as Record<string, unknown>).metaCampaignId as string | null;
  if (existingCampaignId) {
    const adsWithAdsets = await prisma.adLabAd.count({
      where: { metaCampaignId: existingCampaignId, metaAdsetId: { not: null } },
    });
    if (adsWithAdsets === 0) {
      console.log("[adlab-launch] Cleaning up orphaned campaign:", existingCampaignId);
      try { await meta.deleteCampaign(existingCampaignId); } catch {}
      await prisma.adLabExperiment.update({ where: { id: experimentId }, data: { metaCampaignId: null } });
    }
  }

  // Auto-generate landing page for website campaigns
  let generatedLandingPage: { slug: string } | null = null;
  if (!isAppInstall && !experiment.landingPage) {
    try {
      generatedLandingPage = await generateLandingPage(experimentId);
      console.log("[adlab-launch] Landing page generated:", generatedLandingPage.slug);
    } catch (err) {
      console.warn("[adlab-launch] Landing page generation failed (will use project URL):", String(err));
    }
  }
  const effectiveLandingPage = experiment.landingPage ?? generatedLandingPage;

  const errors: { creativeId: string; error: string }[] = [];
  const created: { creativeId: string; adId: string; adsetId: string }[] = [];

  try {
    // ═══════════════════════════════════════════
    // STEP 1: Create ONE campaign
    // ═══════════════════════════════════════════
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
      campaignId = await withRetry(
        () => meta.createCampaign({ name: campaignName, objective: campaignObjective }),
        { label: "Campaign creation" }
      );
      console.log("[adlab-launch] Campaign created:", campaignId);
    } catch (err) {
      logMetaError("Campaign creation (all retries exhausted)", err);
      return NextResponse.json(
        { error: "Campaign creation failed after 3 retries", detail: extractErrorDetail(err) },
        { status: 500 }
      );
    }

    await prisma.adLabExperiment.update({
      where: { id: experimentId },
      data: { metaCampaignId: campaignId },
    });

    await delay(1000);

    // ═══════════════════════════════════════════
    // STEP 2: Create ONE ad set
    // ═══════════════════════════════════════════
    const audience = project.targetAudience as Record<string, unknown>;
    const expRecord = experiment as Record<string, unknown>;
    const adsetBudget = (expRecord.adSetDailyBudgetCents as number) || project.dailyBudgetCentsPerVariant;
    const convEvent = (expRecord.optimizationEvent as string) || project.conversionEvent || "Lead";
    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const adsetName = `${project.name} | ${topicSlug} | ${dateStr}`;

    console.log("[adlab-launch] Creating single ad set:", { adsetName, adsetBudget, convEvent });

    let adsetId: string;
    try {
      const projectInterests = (project as Record<string, unknown>).targetInterests as { id: string; name: string }[] | null;
      const placementType = (expRecord.placementType as string) || null;
      adsetId = await withRetry(
        () => meta.createAdSet({
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
            ? { appInstall: { applicationId: metaAppId, objectStoreUrl: APP_STORE_URL } }
            : {}),
        }),
        { label: "Ad set creation" }
      );
      console.log("[adlab-launch] Ad set created:", adsetId);
    } catch (err) {
      logMetaError("Ad set creation (all retries exhausted)", err);
      // Clean up orphaned campaign
      try { await meta.deleteCampaign(campaignId); } catch {}
      await prisma.adLabExperiment.update({ where: { id: experimentId }, data: { metaCampaignId: null } });
      return NextResponse.json(
        { error: "Ad set creation failed after 3 retries", detail: extractErrorDetail(err) },
        { status: 500 }
      );
    }

    await delay(1000);

    // ═══════════════════════════════════════════
    // STEP 3: Create ads — one per creative, with retry + rate limiting
    // ═══════════════════════════════════════════
    for (let idx = 0; idx < launchableCreatives.length; idx++) {
      const creative = launchableCreatives[idx];
      const creativeType = (creative as Record<string, unknown>).creativeType as string || "image";
      const angleTag = slug(creative.angle.valueSurface, 20);
      const creativeLabel = `creative ${idx + 1}/${launchableCreatives.length}`;

      try {
        // Upload asset
        let imageHash: string | undefined;
        let videoId: string | undefined;

        if (creativeType === "video" && creative.videoUrl) {
          console.log(`[adlab-launch] Uploading video for ${creativeLabel}`);
          try {
            videoId = await withRetry(
              () => meta.uploadVideo(creative.videoUrl!),
              { label: `Video upload ${creativeLabel}`, retryDelayMs: 10_000 }
            );
          } catch {
            errors.push({ creativeId: creative.id, error: "Video upload failed after 3 retries" });
            continue;
          }
        } else if (creative.imageUrl) {
          console.log(`[adlab-launch] Uploading image for ${creativeLabel}`);
          try {
            imageHash = await withRetry(
              () => meta.uploadImage(creative.imageUrl!),
              { label: `Image upload ${creativeLabel}` }
            );
          } catch {
            errors.push({ creativeId: creative.id, error: "Image upload failed after 3 retries" });
            continue;
          }
        }

        await delay(1000);

        // Build destination URL
        let adLinkUrl: string;
        if (isAppInstall) {
          adLinkUrl = APP_STORE_URL;
        } else {
          const baseUrl = effectiveLandingPage?.slug
            ? `https://getacuity.io/for/${effectiveLandingPage.slug}`
            : landingPageUrl!;
          const linkUrl = new URL(baseUrl);
          linkUrl.searchParams.set("utm_source", "meta");
          linkUrl.searchParams.set("utm_medium", "paid");
          linkUrl.searchParams.set("utm_campaign", experiment.id);
          linkUrl.searchParams.set("utm_content", creative.id);
          adLinkUrl = linkUrl.toString();
        }

        // Create ad creative object on Meta
        const surface = creative.angle.valueSurface;
        const angleSlug = slug(creative.angle.hypothesis, 50);
        let metaCreativeId: string;
        try {
          metaCreativeId = await withRetry(
            () => meta.createAdCreative({
              name: `${project.name} | ${surface}: ${angleSlug} | "${slug(creative.headline, 40)}"`,
              pageId: metaPageId!,
              imageHash,
              videoId,
              headline: creative.headline,
              primaryText: creative.primaryText,
              description: creative.description,
              cta: isAppInstall ? "DOWNLOAD" : creative.cta,
              linkUrl: adLinkUrl,
            }),
            { label: `Ad creative ${creativeLabel}` }
          );
        } catch (err) {
          logMetaError(`Ad creative ${creativeLabel}`, err);
          errors.push({ creativeId: creative.id, error: `Ad creative creation failed: ${extractErrorDetail(err)}` });
          continue;
        }

        await delay(1000);

        // Create the ad inside the single ad set
        const adName = `${project.name} | ${angleTag} | Creative ${idx + 1}`;
        let metaAdId: string;
        try {
          metaAdId = await withRetry(
            () => meta.createAd({ name: adName, adsetId, creativeId: metaCreativeId }),
            { label: `Ad ${creativeLabel}` }
          );
        } catch (err) {
          logMetaError(`Ad ${creativeLabel}`, err);
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
            dailyBudgetCents: adsetBudget,
          },
        });

        created.push({ creativeId: creative.id, adId: metaAdId, adsetId });
        console.log(`[adlab-launch] Ad ${idx + 1}/${launchableCreatives.length} created: ${metaAdId}`);

        // Rate limit between ads (skip after last)
        if (idx < launchableCreatives.length - 1) {
          await delay(1000);
        }
      } catch (err) {
        logMetaError(`Unexpected error for ${creativeLabel}`, err);
        errors.push({ creativeId: creative.id, error: extractErrorDetail(err) });
      }
    }

    console.log(`[adlab-launch] Done. Created: ${created.length}/${launchableCreatives.length}, Errors: ${errors.length}`);

    // If ALL ads failed, clean up the orphaned campaign + ad set
    if (created.length === 0 && errors.length > 0) {
      console.log("[adlab-launch] All ads failed — cleaning up campaign:", campaignId);
      try { await meta.deleteCampaign(campaignId); } catch {}
      await prisma.adLabExperiment.update({ where: { id: experimentId }, data: { metaCampaignId: null } });
      return NextResponse.json(
        { error: "All ads failed to create — campaign deleted", errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      campaignId,
      campaignName,
      adsetId,
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
