/**
 * GET /api/admin/adlab/reconcile — one-time (re-runnable) reconciliation of
 * DB "live/scaled" AdLab ads against Meta's actual delivery status.
 *
 * Why: 139 ads from the May 2026 validation tests were left status=live in
 * the DB after being paused/archived on Meta. The daily cron loads every
 * DB-live ad, so ghosts waste Meta calls, risk the 300s Vercel budget, and
 * would make the kill engine churn on ads that stopped delivering months ago.
 *
 * Lives as an API route (not a local script) because META_ACCESS_TOKEN is a
 * Vercel-sensitive env var — it cannot be pulled locally, so Meta calls only
 * work server-side.
 *
 * Per DB-live ad:
 *   - metaAdId missing     → mark killed (never reached Meta)
 *   - Meta object gone     → mark killed
 *   - Meta not ACTIVE      → mark killed (records Meta status)
 *   - Meta ACTIVE          → LEFT ALONE and reported
 * Then any status=live experiment with zero remaining live ads is concluded.
 * NEVER writes to Meta — DB-only, matching Meta reality.
 *
 * Usage:
 *   GET /api/admin/adlab/reconcile           # dry run (default)
 *   GET /api/admin/adlab/reconcile?apply=1   # write changes
 * Auth: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyObjectOnMeta } from "@/lib/adlab/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apply = req.nextUrl.searchParams.get("apply") === "1";
  const today = new Date().toISOString().slice(0, 10);

  const ads = await prisma.adLabAd.findMany({
    where: { status: { in: ["live", "scaled"] } },
    select: { id: true, metaAdId: true, launchedAt: true },
    orderBy: { launchedAt: "asc" },
  });

  let toKill = 0;
  let errors = 0;
  const statusCounts: Record<string, number> = {};
  const stillActive: { adId: string; metaAdId: string; launched: string | null }[] = [];

  for (const ad of ads) {
    let reason: string | null = null;

    if (!ad.metaAdId) {
      reason = `reconcile ${today}: no metaAdId — never launched on Meta`;
      statusCounts["NO_META_ID"] = (statusCounts["NO_META_ID"] ?? 0) + 1;
    } else {
      const check = await verifyObjectOnMeta(ad.metaAdId, "ad");
      if (!check.exists) {
        reason = `reconcile ${today}: gone on Meta (${check.error?.slice(0, 80)})`;
        statusCounts["GONE"] = (statusCounts["GONE"] ?? 0) + 1;
      } else if (check.status !== "ACTIVE") {
        reason = `reconcile ${today}: Meta effective_status=${check.status}`;
        statusCounts[check.status ?? "UNKNOWN"] = (statusCounts[check.status ?? "UNKNOWN"] ?? 0) + 1;
      } else {
        statusCounts["ACTIVE"] = (statusCounts["ACTIVE"] ?? 0) + 1;
        stillActive.push({
          adId: ad.id,
          metaAdId: ad.metaAdId,
          launched: ad.launchedAt?.toISOString().slice(0, 10) ?? null,
        });
      }
    }

    if (reason) {
      toKill++;
      if (apply) {
        try {
          await prisma.adLabAd.update({
            where: { id: ad.id },
            data: { status: "killed", decisionReason: reason },
          });
        } catch (err) {
          errors++;
          console.error(`[adlab-reconcile] update failed for ${ad.id}:`, err instanceof Error ? err.message : err);
        }
      }
    }
  }

  // Conclude live experiments with no remaining live ads
  const experiments: { expId: string; name: string | null; remaining: number; action: string }[] = [];
  const liveExps = await prisma.adLabExperiment.findMany({
    where: { status: "live" },
    select: {
      id: true,
      campaignName: true,
      angles: { select: { creatives: { select: { ads: { select: { id: true } } } } } },
    },
  });
  for (const exp of liveExps) {
    const expAdIds = exp.angles.flatMap((a) => a.creatives.flatMap((c) => c.ads.map((ad) => ad.id)));
    // Fresh count so apply-mode kills above are reflected. In dry-run this is
    // pre-apply state, so it may show "keep" for experiments that would
    // conclude after an apply.
    const remaining = await prisma.adLabAd.count({
      where: { id: { in: expAdIds }, status: { in: ["live", "scaled"] } },
    });
    const conclude = remaining === 0;
    experiments.push({
      expId: exp.id,
      name: exp.campaignName,
      remaining,
      action: conclude ? "conclude" : "keep",
    });
    if (conclude && apply) {
      await prisma.adLabExperiment.update({
        where: { id: exp.id },
        data: { status: "concluded", concludedAt: new Date() },
      });
    }
  }

  return NextResponse.json({
    mode: apply ? "APPLY" : "DRY_RUN",
    dbLiveAds: ads.length,
    toKill,
    leftActive: stillActive.length,
    errors,
    metaStatusBreakdown: statusCounts,
    stillActiveOnMeta: stillActive,
    experiments,
  });
}
