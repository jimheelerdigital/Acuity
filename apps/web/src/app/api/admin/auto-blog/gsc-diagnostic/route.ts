/**
 * GET /api/admin/auto-blog/gsc-diagnostic
 *
 * Reports the live Google Search Console state for the blog engine:
 * - which service account we're authing as (so it can be added in GSC)
 * - which properties that account can actually see
 * - sitemap submission status for the goripple.io property
 * - 30-day site totals + top pages
 * - URL Inspection results for 3 sample posts (old / mid / new)
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}` so it
 * can be curled without a browser session. GA4_SERVICE_ACCOUNT_KEY is
 * Vercel-sensitive, so this is the only way to run GSC diagnostics.
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { getGoogleAuthClient } from "@/lib/google/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROPERTY = process.env.GSC_PROPERTY ?? "sc-domain:goripple.io";

export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = !!cronSecret && bearer === `Bearer ${cronSecret}`;
  if (!bearerOk) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }

  // Service account identity
  const raw = process.env.GA4_SERVICE_ACCOUNT_KEY;
  let serviceAccountEmail: string | null = null;
  if (raw) {
    try {
      let jsonStr = raw.trim();
      if (!jsonStr.startsWith("{")) {
        jsonStr = Buffer.from(jsonStr, "base64").toString("utf-8");
      }
      serviceAccountEmail = JSON.parse(jsonStr).client_email ?? null;
    } catch {
      // reported below via auth failure
    }
  }

  const auth = getGoogleAuthClient([
    "https://www.googleapis.com/auth/webmasters",
  ]);
  if (!auth) {
    return NextResponse.json(
      { error: "GA4_SERVICE_ACCOUNT_KEY missing or unparseable", serviceAccountEmail },
      { status: 503 }
    );
  }

  const sc = google.searchconsole({ version: "v1", auth });
  const report: Record<string, unknown> = { serviceAccountEmail, property: PROPERTY };

  // 1. Properties visible to this service account
  try {
    const sites = await sc.sites.list();
    report.visibleProperties = (sites.data.siteEntry ?? []).map((s) => ({
      siteUrl: s.siteUrl,
      permissionLevel: s.permissionLevel,
    }));
  } catch (err) {
    report.visibleProperties = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 2. Sitemap submission status
  try {
    const sm = await sc.sitemaps.list({ siteUrl: PROPERTY });
    report.sitemaps = (sm.data.sitemap ?? []).map((s) => ({
      path: s.path,
      lastSubmitted: s.lastSubmitted,
      lastDownloaded: s.lastDownloaded,
      errors: s.errors,
      warnings: s.warnings,
      indexed: s.contents?.map((c) => ({
        type: c.type,
        submitted: c.submitted,
        indexed: c.indexed,
      })),
    }));
  } catch (err) {
    report.sitemaps = { error: err instanceof Error ? err.message : String(err) };
  }

  // 3. 30-day totals + top pages
  const end = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  try {
    const total = await sc.searchanalytics.query({
      siteUrl: PROPERTY,
      requestBody: { startDate: start, endDate: end, rowLimit: 1 },
    });
    const t = total.data.rows?.[0];
    const pages = await sc.searchanalytics.query({
      siteUrl: PROPERTY,
      requestBody: { startDate: start, endDate: end, dimensions: ["page"], rowLimit: 15 },
    });
    report.performance = {
      window: `${start}..${end}`,
      totals: { clicks: t?.clicks ?? 0, impressions: t?.impressions ?? 0 },
      topPages: (pages.data.rows ?? []).map((r) => ({
        page: r.keys?.[0],
        clicks: r.clicks,
        impressions: r.impressions,
        position: r.position,
      })),
    };
  } catch (err) {
    report.performance = { error: err instanceof Error ? err.message : String(err) };
  }

  // 4. Inspect 3 sample posts: oldest, middle, newest
  try {
    const posts = await prisma.contentPiece.findMany({
      where: { type: "BLOG", status: "AUTO_PUBLISHED", distributedUrl: { not: null } },
      orderBy: { publishedAt: "asc" },
      select: { distributedUrl: true },
    });
    const picks = [
      posts[0],
      posts[Math.floor(posts.length / 2)],
      posts[posts.length - 1],
    ].filter(Boolean);

    const inspections: Array<Record<string, unknown>> = [];
    for (const p of picks) {
      try {
        const res = await sc.urlInspection.index.inspect({
          requestBody: { inspectionUrl: p!.distributedUrl!, siteUrl: PROPERTY },
        });
        const r = res.data.inspectionResult?.indexStatusResult;
        inspections.push({
          url: p!.distributedUrl,
          verdict: r?.verdict,
          coverageState: r?.coverageState,
          lastCrawlTime: r?.lastCrawlTime,
          robotsTxtState: r?.robotsTxtState,
          pageFetchState: r?.pageFetchState,
          googleCanonical: r?.googleCanonical,
          referringUrls: r?.referringUrls?.length ?? 0,
        });
      } catch (err) {
        inspections.push({
          url: p!.distributedUrl,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    report.sampleInspections = inspections;
  } catch (err) {
    report.sampleInspections = { error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json(report);
}
