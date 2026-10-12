/**
 * POST /api/admin/adlab/ads/solo-adsets
 *
 * One ad per ad set (2026-10-12, per Keenan: "turn off all existing ads,
 * only run these new ones. run them all as separate ad groups with
 * independent $15 daily budgets"). For each given AdLabAd (already launched,
 * e.g. paused in the TEST ad set): gives it its own ad set in the lane's
 * evergreen campaign (ensureDedicatedAdSet; same targeting and PURCHASE
 * optimization as MAIN) with budgetCents/day, creates a live ad there on
 * the SAME Meta creative, and kills the source copy. With pauseOthers, every
 * other live/scaled AdLabAd is paused on Meta and marked paused.
 *
 * Body: { adIds: string[], budgetCents?: number (default 1500), pauseOthers?: boolean, dryRun?: boolean }
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const body = (await req.json().catch(() => ({}))) as { adIds?: string[]; budgetCents?: number; pauseOthers?: boolean; dryRun?: boolean };
  const adIds = (body.adIds ?? []).filter((x) => typeof x === "string").slice(0, 20);
  if (!adIds.length) return NextResponse.json({ error: "adIds required" }, { status: 400 });
  const budgetCents = Math.min(Math.max(Math.round(Number(body.budgetCents) || 1500), 500), 10000);

  const meta = await import("@/lib/adlab/meta");
  const { ensureDedicatedAdSet, weeklyBatchGroup } = await import("@/lib/adlab/evergreen");

  const sources = await prisma.adLabAd.findMany({
    where: { id: { in: adIds } },
    select: {
      id: true,
      metaAdId: true,
      creativeId: true,
      creative: { select: { headline: true, angle: { select: { experiment: { select: { campaignTags: true } } } } } },
    },
  });
  const plan = sources.map((s) => ({
    id: s.id,
    headline: s.creative.headline,
    group: weeklyBatchGroup(s.creative.angle.experiment.campaignTags ?? []),
    metaAdId: s.metaAdId,
  }));
  const others = body.pauseOthers
    ? await prisma.adLabAd.findMany({
        where: { status: { in: ["live", "scaled"] }, id: { notIn: adIds } },
        select: { id: true, metaAdId: true, creative: { select: { headline: true } } },
      })
    : [];
  if (body.dryRun) {
    return NextResponse.json({ plan, budgetCents, wouldPause: others.map((o) => o.creative.headline) });
  }

  const launched: Record<string, unknown>[] = [];
  const keep = new Set<string>();
  for (const p of plan) {
    try {
      if (!p.group || !p.metaAdId) throw new Error(`missing ${!p.group ? "group" : "metaAdId"}`);
      const label = p.headline.replace(/[^a-zA-Z0-9 ']+/g, "").trim().slice(0, 50);
      const set = await ensureDedicatedAdSet(p.group, label, budgetCents);
      const src = await meta.metaGraph(p.metaAdId, "GET", { fields: "name,creative{id}" });
      const metaCreativeId = (src.creative as { id?: string } | undefined)?.id;
      if (!metaCreativeId) throw new Error("no Meta creative on source ad");
      const made = await meta.metaGraph(`${meta.adAccountPath()}/ads`, "POST", {
        name: String(src.name ?? p.headline),
        adset_id: set.adsetId,
        creative: { creative_id: metaCreativeId },
        status: "ACTIVE",
      });
      const row = await prisma.adLabAd.create({
        data: {
          creativeId: sources.find((s) => s.id === p.id)!.creativeId,
          metaCampaignId: set.campaignId,
          metaAdsetId: set.adsetId,
          metaAdId: made.id as string,
          status: "live",
          launchedAt: new Date(),
          dailyBudgetCents: budgetCents,
        },
      });
      keep.add(row.id);
      // The source copy (paused in TEST) is retired so it never doubles up.
      await meta.setStatus(p.metaAdId, "ad", "PAUSED").catch(() => undefined);
      await prisma.adLabAd.update({ where: { id: p.id }, data: { status: "killed", decisionReason: "Moved to its own ad set (solo-adsets)." } });
      const check = await meta.metaGraph(made.id as string, "GET", { fields: "effective_status,adset{name,daily_budget,effective_status}" });
      launched.push({ headline: p.headline, adsetId: set.adsetId, adId: made.id, meta: check });
    } catch (err) {
      launched.push({ headline: p.headline, error: meta.redactAccessToken(String(err)).slice(0, 300) });
    }
  }

  const paused: Record<string, unknown>[] = [];
  for (const o of others) {
    if (keep.has(o.id)) continue;
    try {
      if (o.metaAdId) await meta.setStatus(o.metaAdId, "ad", "PAUSED");
      await prisma.adLabAd.update({ where: { id: o.id }, data: { status: "paused", decisionReason: "Paused by hand (Keenan, 10-12): only the 5 solo ad sets run." } });
      await prisma.adLabDecision.create({ data: { adId: o.id, decisionType: "manual", rationale: "PAUSE (manual): only the new solo ad sets run (10-12)." } });
      paused.push({ headline: o.creative.headline, paused: true });
    } catch (err) {
      paused.push({ headline: o.creative.headline, error: meta.redactAccessToken(String(err)).slice(0, 300) });
    }
  }
  return NextResponse.json({ launched, paused });
}
