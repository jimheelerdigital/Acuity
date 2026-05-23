/**
 * POST /api/admin/adlab/ads/reactivate
 *
 * Finds all ads killed in the last 48 hours and reactivates them on
 * Meta + updates DB status to "live". One-time cleanup route created
 * 2026-05-23 after kill rules were disabled.
 *
 * Protected by CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Find all ads killed in the last 48 hours
  const killedAds = await prisma.adLabAd.findMany({
    where: {
      status: "killed",
      updatedAt: { gte: cutoff },
    },
    include: {
      creative: { select: { headline: true, creativeType: true } },
    },
  });

  if (killedAds.length === 0) {
    return NextResponse.json({ message: "No recently killed ads to reactivate" });
  }

  const results: { id: string; headline: string; metaAdId: string | null; success: boolean; error?: string }[] = [];

  for (const ad of killedAds) {
    try {
      // Reactivate on Meta
      if (ad.metaAdId) {
        await meta.setStatus(ad.metaAdId, "ad", "ACTIVE");
      }
      if (ad.metaAdsetId) {
        await meta.setStatus(ad.metaAdsetId, "adset", "ACTIVE");
      }

      // Update DB
      await prisma.adLabAd.update({
        where: { id: ad.id },
        data: { status: "live", decisionReason: "Manually reactivated — kill rules disabled 2026-05-23" },
      });

      // Log the manual decision
      await prisma.adLabDecision.create({
        data: {
          adId: ad.id,
          decisionType: "manual",
          rationale: "Reactivated after kill rules disabled. Previous reason: " + (ad.decisionReason || "unknown"),
        },
      });

      results.push({ id: ad.id, headline: ad.creative.headline, metaAdId: ad.metaAdId, success: true });
    } catch (err) {
      results.push({
        id: ad.id,
        headline: ad.creative.headline,
        metaAdId: ad.metaAdId,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    reactivated: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    details: results,
  });
}
