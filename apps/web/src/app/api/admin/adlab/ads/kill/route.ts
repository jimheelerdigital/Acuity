/**
 * POST /api/admin/adlab/ads/kill — turn off specific ads by hand (2026-10-04,
 * per Keenan: "kill the 'keep the promises' and 'say it ripple sorts it'").
 *
 * Body: { adIds: string[] (AdLabAd ids), reason?: string, inspect?: boolean }
 * - inspect: read-only — returns Meta's status / effective_status / review
 *   feedback for each ad, changes nothing.
 * - otherwise: PAUSE the ad in Meta, mark it killed and log a manual decision
 *   (the daily cron then leaves it alone).
 *
 * Auth: admin session.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => ({}))) as { adIds?: string[]; reason?: string; inspect?: boolean };
  const adIds = (body.adIds ?? []).filter((x) => typeof x === "string").slice(0, 20);
  if (!adIds.length) return NextResponse.json({ error: "adIds required" }, { status: 400 });

  const meta = await import("@/lib/adlab/meta");
  const ads = await prisma.adLabAd.findMany({ where: { id: { in: adIds } }, select: { id: true, metaAdId: true, status: true } });
  const out: Record<string, unknown>[] = [];
  for (const ad of ads) {
    if (!ad.metaAdId) {
      out.push({ id: ad.id, error: "no metaAdId" });
      continue;
    }
    try {
      if (body.inspect) {
        const info = await meta.metaGraph(ad.metaAdId, "GET", {
          fields: "name,status,configured_status,effective_status,ad_review_feedback,issues_info,updated_time",
        });
        out.push({ id: ad.id, dbStatus: ad.status, meta: info });
        continue;
      }
      await meta.setStatus(ad.metaAdId, "ad", "PAUSED");
      const reason = body.reason?.slice(0, 300) || "Turned off by hand (Keenan).";
      await prisma.adLabAd.update({ where: { id: ad.id }, data: { status: "killed", decisionReason: reason } });
      await prisma.adLabDecision.create({ data: { adId: ad.id, decisionType: "manual", rationale: `KILL (manual): ${reason}` } });
      out.push({ id: ad.id, killed: true });
    } catch (err) {
      out.push({ id: ad.id, error: meta.redactAccessToken(String(err)).slice(0, 300) });
    }
  }
  return NextResponse.json({ results: out });
}
