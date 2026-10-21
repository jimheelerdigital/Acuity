/**
 * POST /api/admin/adlab/consolidate
 *
 * One ad set per audience, optimizing for completed registrations
 * (2026-10-20, per Keenan: "consolidate all ugc ads into one adset focused ON
 * COMPLETED REGISTRATIONS. focus the other for men on same thing. turn the
 * ads off and then reboot them with completed registrations as the source").
 *
 * action "list": every live ad set in the account with its ads and 7-day
 *   spend / registrations / purchases. Read-only.
 *
 * action "run": { group: "women" | "men", name, budgetCents, metaAdIds[],
 *   setMain?: boolean, dryRun?: boolean }
 *   1. creates ONE ad set in the lane's evergreen campaign optimizing for
 *      GROUP_OPTIMIZATION_EVENT (COMPLETE_REGISTRATION), copying targeting
 *      and attribution from the first source ad's ad set, created PAUSED;
 *   2. re-creates each source ad in it on the SAME Meta creative (same asset,
 *      copy and tracking link, so attribution is unchanged);
 *   3. activates the new ad set, THEN pauses each source ad, and pauses a
 *      source ad set once none of its ads are still running;
 *   4. AdLab-tracked sources get a new live AdLabAd row; the old row is
 *      marked killed with the reason. UGC ads aren't AdLab rows.
 *   5. setMain: the new ad set becomes the lane's evergreen (main) ad set,
 *      so future launches join it instead of getting their own.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type MetaAd = { id: string; name: string; effective_status: string; adset_id?: string; creative?: { id: string } };

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    group?: "women" | "men";
    name?: string;
    budgetCents?: number;
    metaAdIds?: string[];
    setMain?: boolean;
    dryRun?: boolean;
  };
  const meta = await import("@/lib/adlab/meta");

  if (body.action === "list") {
    const sets = await meta.metaGraph(`${meta.adAccountPath()}/adsets`, "GET", {
      fields: "id,name,campaign{id,name,objective},daily_budget,optimization_goal,promoted_object,effective_status",
      effective_status: ["ACTIVE"],
      limit: "100",
    });
    const out: Record<string, unknown>[] = [];
    for (const s of (sets.data as Record<string, any>[]) ?? []) {
      const ads = await meta.metaGraph(`${s.id}/ads`, "GET", {
        fields: "id,name,effective_status,creative{id},insights.date_preset(last_7d){spend,actions}",
        limit: "100",
      });
      out.push({
        adsetId: s.id,
        name: s.name,
        campaign: s.campaign?.name,
        campaignId: s.campaign?.id,
        objective: s.campaign?.objective,
        budget: Number(s.daily_budget ?? 0) / 100,
        optimizing: `${s.optimization_goal} ${s.promoted_object?.custom_event_type ?? ""}`.trim(),
        ads: ((ads.data as Record<string, any>[]) ?? []).map((a) => {
          const ins = a.insights?.data?.[0];
          const act = (t: string) => Number(ins?.actions?.find((x: { action_type: string }) => x.action_type === t)?.value ?? 0);
          return {
            id: a.id,
            name: a.name,
            status: a.effective_status,
            spend7d: Number(ins?.spend ?? 0),
            reg7d: act("offsite_conversion.fb_pixel_complete_registration"),
            purchase7d: act("offsite_conversion.fb_pixel_purchase"),
          };
        }),
      });
    }
    return NextResponse.json({ adsets: out });
  }

  if (body.action !== "run") return NextResponse.json({ error: "action must be list | run" }, { status: 400 });
  const group = body.group;
  const ids = (body.metaAdIds ?? []).filter((x) => typeof x === "string").slice(0, 30);
  if ((group !== "women" && group !== "men") || !body.name || !ids.length) {
    return NextResponse.json({ error: "group, name, metaAdIds required" }, { status: 400 });
  }
  const budgetCents = Math.min(Math.max(Math.round(Number(body.budgetCents) || 0), 500), 20000);
  const { GROUP_OPTIMIZATION_EVENT } = await import("@/lib/adlab/evergreen");
  const project = await prisma.adLabProject.findUniqueOrThrow({ where: { slug: group === "women" ? "ripple-women" : "ripple-men" } });
  if (!project.evergreenCampaignId || !project.metaPixelId) return NextResponse.json({ error: "lane has no evergreen campaign / pixel" }, { status: 400 });

  const sources: MetaAd[] = [];
  for (const id of ids) sources.push((await meta.metaGraph(id, "GET", { fields: "id,name,effective_status,adset_id,creative{id}" })) as unknown as MetaAd);
  const missing = sources.filter((s) => !s.creative?.id || !s.adset_id).map((s) => s.id);
  if (missing.length) return NextResponse.json({ error: `no creative/ad set on ${missing.join(", ")}` }, { status: 400 });
  if (body.dryRun) {
    return NextResponse.json({ group, name: body.name, budgetCents, event: GROUP_OPTIMIZATION_EVENT, ads: sources.map((s) => ({ id: s.id, name: s.name, status: s.effective_status, adset: s.adset_id })) });
  }

  const steps: Record<string, unknown> = {};
  try {
    // 1. The ad set, paused until its ads exist.
    const src = await meta.metaGraph(sources[0].adset_id!, "GET", { fields: "targeting,attribution_spec" });
    const created = await meta.metaGraph(`${meta.adAccountPath()}/adsets`, "POST", {
      name: body.name,
      campaign_id: project.evergreenCampaignId,
      daily_budget: String(budgetCents),
      optimization_goal: "OFFSITE_CONVERSIONS",
      billing_event: "IMPRESSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      destination_type: "WEBSITE",
      promoted_object: { pixel_id: project.metaPixelId, custom_event_type: GROUP_OPTIMIZATION_EVENT },
      targeting: src.targeting,
      ...(src.attribution_spec ? { attribution_spec: src.attribution_spec } : {}),
      status: "PAUSED",
    });
    const adsetId = created.id as string;
    steps.adsetId = adsetId;

    // 2. Same creatives, new ads.
    const made: { from: string; to: string; name: string }[] = [];
    for (const s of sources) {
      const ad = await meta.metaGraph(`${meta.adAccountPath()}/ads`, "POST", {
        name: s.name,
        adset_id: adsetId,
        creative: { creative_id: s.creative!.id },
        status: "ACTIVE",
      });
      made.push({ from: s.id, to: ad.id as string, name: s.name });
    }
    steps.ads = made;

    // 3. New on, then old off (never a gap with both off).
    await meta.setStatus(adsetId, "adset", "ACTIVE");
    for (const s of sources) await meta.setStatus(s.id, "ad", "PAUSED");
    const pausedSets: string[] = [];
    for (const setId of [...new Set(sources.map((s) => s.adset_id!))]) {
      const left = await meta.metaGraph(`${setId}/ads`, "GET", { fields: "id,effective_status", limit: "100" });
      const running = ((left.data as MetaAd[]) ?? []).filter((a) => a.effective_status === "ACTIVE");
      if (!running.length) {
        await meta.setStatus(setId, "adset", "PAUSED");
        pausedSets.push(setId);
      }
    }
    steps.pausedAdsets = pausedSets;

    // 4. AdLab bookkeeping.
    for (const m of made) {
      const row = await prisma.adLabAd.findFirst({ where: { metaAdId: m.from } });
      if (!row) continue;
      await prisma.adLabAd.create({
        data: {
          creativeId: row.creativeId,
          metaCampaignId: project.evergreenCampaignId,
          metaAdsetId: adsetId,
          metaAdId: m.to,
          status: "live",
          launchedAt: new Date(),
          dailyBudgetCents: budgetCents,
        },
      });
      await prisma.adLabAd.update({
        where: { id: row.id },
        data: { status: "killed", decisionReason: "Moved to the consolidated registrations ad set (10-20)." },
      });
    }

    // 5. Future launches join this ad set.
    if (body.setMain) {
      await prisma.adLabProject.update({ where: { id: project.id }, data: { evergreenAdsetId: adsetId } });
      steps.setMain = true;
    }

    steps.check = await meta.getAdSetSettings(adsetId);
    return NextResponse.json({ ok: true, ...steps });
  } catch (err) {
    return NextResponse.json({ error: meta.redactAccessToken(String(err)).slice(0, 500), steps }, { status: 500 });
  }
}
