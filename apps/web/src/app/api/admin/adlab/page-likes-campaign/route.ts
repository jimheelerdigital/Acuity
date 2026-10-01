/**
 * POST /api/admin/adlab/page-likes-campaign
 *
 * One-off (2026-10-01, per Keenan: "can you just create the campaign for
 * me?"): a $10/day, 7-day Page-likes campaign for a brand's Facebook Page,
 * promoting an existing post. Uses AdLab's ads token (META_ACCESS_TOKEN) and
 * ad account. Everything is created PAUSED; it is switched ACTIVE only when
 * campaign, ad set and ad were all created, and only if body.activate=true.
 *
 * Body: { pageId, postId (page post id "pageid_objectid" or object id),
 *         dailyBudgetUsd?: 10, days?: 7, name?, interests?: string[], activate?: boolean }
 * Auth: admin session OR Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const token = process.env.META_ACCESS_TOKEN;
  const rawAccount = process.env.META_AD_ACCOUNT_ID;
  if (!token || !rawAccount) return NextResponse.json({ error: "META_ACCESS_TOKEN / META_AD_ACCOUNT_ID missing" }, { status: 500 });
  const act = rawAccount.startsWith("act_") ? rawAccount : `act_${rawAccount}`;
  const v = process.env.META_API_VERSION || "v25.0";
  const G = `https://graph.facebook.com/${v}`;

  const body = (await req.json().catch(() => ({}))) as {
    pageId?: string;
    postId?: string;
    dailyBudgetUsd?: number;
    days?: number;
    name?: string;
    interests?: string[];
    activate?: boolean;
  };
  if (!body.pageId || !body.postId) return NextResponse.json({ error: "pageId and postId required" }, { status: 400 });
  const log: unknown[] = [];
  const call = async (method: "GET" | "POST", path: string, params: Record<string, unknown>) => {
    const form = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) form.set(k, typeof val === "string" ? val : JSON.stringify(val));
    form.set("access_token", token);
    const res =
      method === "GET"
        ? await fetch(`${G}/${path}?${form}`)
        : await fetch(`${G}/${path}`, { method: "POST", body: form });
    const json = await res.json();
    const detail = json.error ? [json.error.message, json.error.error_user_title, json.error.error_user_msg, json.error.error_subcode].filter(Boolean).join(" | ") : "";
    log.push({ path, ok: res.ok, ...(res.ok ? {} : { error: detail || json }) });
    if (!res.ok) throw new Error(`${path}: ${detail || res.status}`);
    return json;
  };

  try {
    // Interests by name → ids (skip any that don't resolve).
    const names = body.interests ?? [
      "Dungeons & Dragons",
      "The Lord of the Rings",
      "Game of Thrones",
      "The Witcher",
      "The Elder Scrolls V: Skyrim",
      "Elden Ring",
      "Fantasy literature",
      "Mythology",
      "Dragon",
    ];
    const interests: { id: string; name: string }[] = [];
    for (const n of names) {
      try {
        const r = await call("GET", "search", { type: "adinterest", q: n, limit: "1" });
        const hit = r.data?.[0];
        if (hit?.id) interests.push({ id: String(hit.id), name: String(hit.name) });
      } catch {
        // skip unresolvable interest
      }
    }

    const days = body.days ?? 7;
    const start = new Date(Date.now() + 5 * 60_000);
    const end = new Date(start.getTime() + days * 86_400_000);
    const name = body.name ?? "Mythicals – Page likes";

    const campaign = await call("POST", `${act}/campaigns`, {
      name,
      objective: "OUTCOME_ENGAGEMENT",
      status: "PAUSED",
      special_ad_categories: [],
      // Required since Graph v23 when the budget lives on the ad set.
      is_adset_budget_sharing_enabled: false,
    });
    const adset = await call("POST", `${act}/adsets`, {
      name: `${name} – US/CA/UK/AU 18-34`,
      campaign_id: campaign.id,
      daily_budget: String(Math.round((body.dailyBudgetUsd ?? 10) * 100)),
      billing_event: "IMPRESSIONS",
      optimization_goal: "PAGE_LIKES",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      destination_type: "ON_PAGE",
      promoted_object: { page_id: body.pageId },
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "PAUSED",
      targeting: {
        geo_locations: { countries: ["US", "CA", "GB", "AU"] },
        age_min: 18,
        age_max: 34,
        ...(interests.length ? { flexible_spec: [{ interests }] } : {}),
        publisher_platforms: ["facebook"],
        facebook_positions: ["feed", "facebook_reels", "video_feeds"],
      },
    });
    const objectStoryId = body.postId.includes("_") ? body.postId : `${body.pageId}_${body.postId}`;
    const creative = await call("POST", `${act}/adcreatives`, { name: `${name} – creative`, object_story_id: objectStoryId });
    const ad = await call("POST", `${act}/ads`, {
      name: `${name} – ad`,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: "PAUSED",
    });

    if (body.activate) {
      await call("POST", ad.id, { status: "ACTIVE" });
      await call("POST", adset.id, { status: "ACTIVE" });
      await call("POST", campaign.id, { status: "ACTIVE" });
    }
    return NextResponse.json({
      ok: true,
      active: !!body.activate,
      campaignId: campaign.id,
      adsetId: adset.id,
      adId: ad.id,
      interests: interests.map((i) => i.name),
      start: start.toISOString(),
      end: end.toISOString(),
      log,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err), log }, { status: 500 });
  }
}
