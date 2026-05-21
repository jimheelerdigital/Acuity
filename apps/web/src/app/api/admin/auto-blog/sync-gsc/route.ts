/**
 * POST /api/admin/auto-blog/sync-gsc
 *
 * Syncs Google Search Console performance data (impressions, clicks, CTR,
 * average position) for ALL published blog posts. This endpoint can be
 * triggered manually from the admin dashboard or called by a cron.
 *
 * The pruner (auto-blog.ts) also syncs GSC data, but only for posts that
 * are 56+ days old. This endpoint syncs ALL posts regardless of age so
 * the dashboard always shows up-to-date metrics.
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { getPropertyPerformance, normalizeGscUrl } from "@/lib/google/search-console";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  // Auth pre-check — surface clear errors to the admin dashboard
  const raw = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    return NextResponse.json(
      {
        error: "GA4_SERVICE_ACCOUNT_KEY is not set",
        fix: "Add GA4_SERVICE_ACCOUNT_KEY to Vercel environment variables (Production). Value must be the full JSON content of a Google Cloud service account key file. The service account email must be added as a user in Google Search Console for sc-domain:getacuity.io.",
      },
      { status: 503 }
    );
  }

  let serviceAccountEmail: string | undefined;
  try {
    const creds = JSON.parse(raw);
    serviceAccountEmail = creds.client_email;
    if (!creds.client_email || !creds.private_key) {
      return NextResponse.json(
        {
          error: "GA4_SERVICE_ACCOUNT_KEY is missing client_email or private_key",
          fix: "The env var must contain the full JSON from a Google Cloud service account key file. Download a new key from Google Cloud Console → IAM → Service Accounts.",
        },
        { status: 503 }
      );
    }
  } catch {
    return NextResponse.json(
      {
        error: "GA4_SERVICE_ACCOUNT_KEY is not valid JSON",
        fix: "The env var must contain the raw JSON content of a service account key file. Ensure it wasn't truncated or double-encoded when pasting into Vercel.",
      },
      { status: 503 }
    );
  }

  // Fetch all published blog posts
  const posts = await prisma.contentPiece.findMany({
    where: {
      type: "BLOG",
      status: { in: ["AUTO_PUBLISHED", "DISTRIBUTED"] },
      distributedUrl: { not: null },
    },
    select: {
      id: true,
      slug: true,
      distributedUrl: true,
    },
  });

  if (posts.length === 0) {
    return NextResponse.json({ synced: 0, message: "No published posts to sync" });
  }

  // Fetch GSC performance for all /blog/* pages (last 30 days)
  let gscData;
  try {
    gscData = await getPropertyPerformance(30);
  } catch (err: unknown) {
    const detail = (err as { gscDetail?: unknown }).gscDetail ?? (err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      {
        error: "GSC API call failed",
        detail,
        serviceAccountEmail,
        fix: `Check the error detail above. Common causes: (1) Search Console API not enabled in the Google Cloud project — go to APIs & Services → Library → search "Google Search Console API" → Enable. (2) Service account ${serviceAccountEmail} not added as Owner in Search Console for sc-domain:getacuity.io. (3) Domain property mismatch.`,
      },
      { status: 502 }
    );
  }

  if (!gscData) {
    return NextResponse.json(
      {
        error: "GSC returned no data (auth may have failed silently)",
        serviceAccountEmail,
        fix: `Ensure ${serviceAccountEmail} is added as a user (Owner or Full permission) in Google Search Console for the property sc-domain:getacuity.io. Go to Search Console → Settings → Users and permissions → Add user.`,
      },
      { status: 502 }
    );
  }

  // Build normalized URL → performance map so trailing-slash and case
  // differences between GSC and our distributedUrl don't break matching.
  const gscByUrl = new Map(
    gscData.topPages.map((p) => [normalizeGscUrl(p.page), p])
  );

  // Diagnostic: log what GSC returned vs what we have
  const gscUrls = Array.from(gscByUrl.keys());
  const dbUrls = posts.map((p) => p.distributedUrl).filter(Boolean);
  console.log(`[sync-gsc] GSC returned ${gscUrls.length} page URLs, DB has ${dbUrls.length} published posts`);
  if (gscUrls.length > 0 && dbUrls.length > 0) {
    console.log(`[sync-gsc] Sample GSC URL: ${gscUrls[0]}`);
    console.log(`[sync-gsc] Sample DB URL:  ${dbUrls[0] ? normalizeGscUrl(dbUrls[0]) : "none"}`);
  }

  const now = new Date();
  let synced = 0;
  let matched = 0;

  for (const post of posts) {
    const normalizedUrl = post.distributedUrl
      ? normalizeGscUrl(post.distributedUrl)
      : null;
    const perf = normalizedUrl ? gscByUrl.get(normalizedUrl) : null;

    const impressions = perf?.impressions ?? 0;
    const clicks = perf?.clicks ?? 0;
    const ctr = perf?.ctr ?? 0;
    const avgPosition = perf?.position ?? 0;

    if (perf) matched++;

    await prisma.contentPiece.update({
      where: { id: post.id },
      data: {
        impressions,
        clicks,
        ctr,
        avgPosition,
        lastGscSyncAt: now,
      },
    });

    synced++;
  }

  if (matched === 0 && gscUrls.length > 0) {
    console.warn(
      `[sync-gsc] WARNING: GSC returned ${gscUrls.length} pages but 0 matched DB URLs. ` +
      `Possible URL format mismatch. GSC sample: "${gscUrls[0]}", DB sample: "${dbUrls[0]}"`
    );
  }

  return NextResponse.json({
    synced,
    matched,
    totalGscPages: gscData.topPages.length,
    syncedAt: now.toISOString(),
  });
}
