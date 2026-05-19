/**
 * POST /api/admin/adlab/ads/add-to-campaign — add new creatives to an existing
 * Meta campaign's ad set. Does NOT create a new campaign or ad set.
 *
 * Accepts: { experimentId, creativeIds: string[] }
 *
 * - Takes the existing campaign ID and ad set ID from the experiment's ads
 * - Uploads new images to Meta and creates ad objects in the existing ad set
 * - Returns confirmation with counts
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";
import { redactAccessToken } from "@/lib/adlab/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function slug(text: string, maxLen = 40): string {
  return text.replace(/[^a-zA-Z0-9 ]+/g, "").trim().replace(/\s+/g, " ").slice(0, maxLen).trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, retryDelayMs = 3000, label = "API call" }: { maxRetries?: number; retryDelayMs?: number; label?: string } = {}
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`[adlab-add] ${label} failed (attempt ${attempt}/${maxRetries}), retrying...`);
      await delay(retryDelayMs);
    }
  }
  throw new Error("unreachable");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractErrorDetail(err: any): string {
  const body = err?.response?.body || err?.body || err?._data;
  const raw = body ? (typeof body === "string" ? body : JSON.stringify(body)) : (err?.message || String(err));
  return redactAccessToken(raw);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { experimentId, creativeIds } = await req.json();

  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }
  if (!creativeIds || !Array.isArray(creativeIds) || creativeIds.length === 0) {
    return NextResponse.json({ error: "creativeIds array required" }, { status: 400 });
  }

  const experiment = await prisma.adLabExperiment.findUnique({
    where: { id: experimentId },
    include: {
      project: true,
      landingPage: true,
      angles: {
        include: {
          creatives: {
            include: { ads: true },
          },
        },
      },
    },
  });

  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  // Find existing campaign and ad set IDs from already-launched ads
  const existingAds = experiment.angles.flatMap((a) =>
    a.creatives.flatMap((c) => c.ads)
  );

  if (existingAds.length === 0 || !experiment.metaCampaignId) {
    return NextResponse.json({ error: "No existing campaign found. Launch the campaign first." }, { status: 400 });
  }

  const adsetId = existingAds.find((a) => a.metaAdsetId)?.metaAdsetId;
  if (!adsetId) {
    return NextResponse.json({ error: "No existing ad set found" }, { status: 400 });
  }

  const campaignId = experiment.metaCampaignId;
  const project = experiment.project;
  const metaPageId = (project as Record<string, unknown>).metaPageId as string | null;
  const isAppInstall = (experiment as Record<string, unknown>).campaignType === "app_install";
  const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

  if (!metaPageId) {
    return NextResponse.json({ error: "Project missing metaPageId" }, { status: 400 });
  }

  // Get the creatives to add
  const creativesToAdd = experiment.angles.flatMap((a) =>
    a.creatives
      .filter((c) => creativeIds.includes(c.id))
      .map((c) => ({ ...c, angle: a }))
  );

  if (creativesToAdd.length === 0) {
    return NextResponse.json({ error: "No matching creatives found" }, { status: 400 });
  }

  const effectiveLandingPage = experiment.landingPage;
  const landingPageUrl = (project as Record<string, unknown>).landingPageUrl as string | null;
  const adsetBudget = (experiment as Record<string, unknown>).adSetDailyBudgetCents as number | null
    || project.dailyBudgetCentsPerVariant;

  const created: { creativeId: string; adId: string }[] = [];
  const errors: { creativeId: string; error: string }[] = [];

  for (let idx = 0; idx < creativesToAdd.length; idx++) {
    const creative = creativesToAdd[idx];
    const creativeType = (creative as Record<string, unknown>).creativeType as string || "image";
    const creativeLabel = `creative ${idx + 1}/${creativesToAdd.length}`;

    try {
      // Upload asset
      let imageHash: string | undefined;
      let videoId: string | undefined;

      if (creativeType === "video" && creative.videoUrl) {
        try {
          videoId = await withRetry(
            () => meta.uploadVideo(creative.videoUrl!),
            { label: `Video upload ${creativeLabel}`, retryDelayMs: 10_000 }
          );
        } catch {
          errors.push({ creativeId: creative.id, error: "Video upload failed" });
          continue;
        }
      } else if (creative.imageUrl) {
        try {
          imageHash = await withRetry(
            () => meta.uploadImage(creative.imageUrl!),
            { label: `Image upload ${creativeLabel}` }
          );
        } catch {
          errors.push({ creativeId: creative.id, error: "Image upload failed" });
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

      // Create ad creative on Meta
      const surface = creative.angle.valueSurface;
      const angleSlug = slug(creative.angle.hypothesis, 50);
      let metaCreativeId: string;
      try {
        metaCreativeId = await withRetry(
          () => meta.createAdCreative({
            name: `${project.name} | ${surface}: ${angleSlug} | "${slug(creative.headline, 40)}"`,
            pageId: metaPageId,
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
        errors.push({ creativeId: creative.id, error: `Ad creative failed: ${extractErrorDetail(err)}` });
        continue;
      }

      await delay(1000);

      // Create ad in the EXISTING ad set
      const existingAdCount = existingAds.length + created.length;
      const adName = `${project.name} | ${slug(surface, 20)} | Creative ${existingAdCount + 1} (added)`;
      let metaAdId: string;
      try {
        metaAdId = await withRetry(
          () => meta.createAd({ name: adName, adsetId, creativeId: metaCreativeId }),
          { label: `Ad ${creativeLabel}` }
        );
      } catch (err) {
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
          status: "live",
          launchedAt: new Date(),
          dailyBudgetCents: adsetBudget,
        },
      });

      created.push({ creativeId: creative.id, adId: metaAdId });
      console.log(`[adlab-add] Ad ${idx + 1}/${creativesToAdd.length} created: ${metaAdId}`);

      if (idx < creativesToAdd.length - 1) await delay(1000);
    } catch (err) {
      errors.push({ creativeId: creative.id, error: extractErrorDetail(err) });
    }
  }

  // Count total live ads
  const totalAds = existingAds.length + created.length;

  return NextResponse.json({
    added: created.length,
    totalAds,
    previousAds: existingAds.length,
    created,
    errors,
    adsetId,
    campaignId,
  });
}
