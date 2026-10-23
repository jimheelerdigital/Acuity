/**
 * POST /api/admin/adlab/app-campaign — Meta App Store-install campaign for
 * Ripple iOS (2026-10-19, per Keenan: "create new campaigns for all that are
 * for app store downloads"; plan in the 10-16 step-by-step email).
 *
 * action "apps": read-only — the apps this ad account may advertise (an app
 *   campaign is impossible until Ripple shows up here).
 * action "create": { appId, budgets: { women, men } (cents), ads: [{ group,
 *   sourceAdId }] } → one OUTCOME_APP_PROMOTION campaign, one ad set per
 *   group (optimizes for APP_INSTALLS, iOS only, targeting copied from the
 *   group's web evergreen ad set), and one ad per source ad reusing its
 *   video/image + copy with an "Install now" button to the App Store.
 *   EVERYTHING IS CREATED PAUSED (standing rule: never switch an ad live on
 *   Meta unasked).
 * action "add": { adsets: { women?, men? }, ads } → more ads into existing
 *   app ad sets (PAUSED).
 * action "activate": { campaignId } → campaign, its ad sets and ads ACTIVE.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Ripple: AI Voice Journal on the US App Store (iOS 1.9.0 live 2026-10-15). */
// Must match the store URL registered on the Meta app EXACTLY
// (GET /859310533882226 → object_store_urls.itunes). With the apps.apple.com
// form Meta didn't tie the ad set to the iOS app and rejected it as "not an
// iOS 14+ campaign" (code 3955009, 2026-10-23). Override per call with storeUrl.
const APP_STORE_URL = "http://itunes.apple.com/app/id6762633410";

type Group = "women" | "men";

const IOS_OS = "iOS_ver_16.0_and_above";

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const meta = await import("@/lib/adlab/meta");
  const acct = meta.adAccountPath();
  const body = (await req.json().catch(() => ({}))) as {
    action?: "apps" | "diag" | "create" | "add" | "fix-os" | "delete" | "activate";
    /** Ad set measurement for iOS 14+ campaigns: "SKADNETWORK" (default), "AEM", or "none". */
    attribution?: "SKADNETWORK" | "AEM" | "none";
    /** "add": existing app ad set per group. */
    adsets?: Partial<Record<Group, string>>;
    appId?: string;
    budgets?: Partial<Record<Group, number>>;
    ads?: { group: Group; sourceAdId: string }[];
    campaignId?: string;
    /** promoted_object.object_store_url override (defaults to APP_STORE_URL). */
    storeUrl?: string;
    /**
     * "aac" (2026-10-23): one Advantage+ app campaign PER GROUP (Women / Men),
     * campaign budget, iOS 14+ with SKAdNetwork, location-only targeting —
     * the setup Ads Manager accepted when the classic per-group ad sets were
     * rejected with 3955009. Default is the classic single campaign.
     */
    mode?: "classic" | "aac";
  };
  const err = (e: unknown) => meta.redactAccessToken(String(e)).slice(0, 500);

  // Read-only: how Meta registered a campaign and the app (2026-10-19 debug).
  if (body.action === "diag") {
    const out: Record<string, unknown> = {};
    for (const [k, path, fields] of [
      ["campaign", body.campaignId, "name,objective,status,is_skadnetwork_attribution,special_ad_categories,buying_type"],
      ["app", body.appId, "name,supported_platforms,object_store_urls"],
    ] as const) {
      if (!path) continue;
      try {
        out[k] = await meta.metaGraph(path, "GET", { fields });
      } catch (e) {
        out[k] = { error: err(e) };
      }
    }
    return NextResponse.json(out);
  }

  if (body.action === "apps") {
    try {
      const apps = await meta.metaGraph(`${acct}/advertisable_applications`, "GET", {
        fields: "id,name,object_store_urls,supported_platforms",
        limit: "50",
      });
      return NextResponse.json({ ok: true, apps: apps.data });
    } catch (e) {
      return NextResponse.json({ error: err(e) }, { status: 500 });
    }
  }

  // Correct an app ad set's OS targeting in place (2026-10-19).
  if (body.action === "fix-os") {
    const out: Record<string, unknown> = {};
    for (const id of Object.values(body.adsets ?? {})) {
      if (!id) continue;
      try {
        const cur = (await meta.metaGraph(id, "GET", { fields: "targeting" })) as { targeting: Record<string, unknown> };
        await meta.metaGraph(id, "POST", { targeting: { ...cur.targeting, user_os: [IOS_OS] } });
        out[id] = ((await meta.metaGraph(id, "GET", { fields: "targeting" })) as { targeting: { user_os?: string[] } }).targeting.user_os;
      } catch (e) {
        out[id] = { error: err(e) };
      }
    }
    return NextResponse.json({ ok: true, user_os: out });
  }

  // Delete a paused app campaign that was built wrong (never ran).
  if (body.action === "delete") {
    if (!body.campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
    try {
      const c = (await meta.metaGraph(body.campaignId, "GET", { fields: "name,effective_status,objective" })) as { name: string; effective_status: string; objective: string };
      if (c.objective !== "OUTCOME_APP_PROMOTION" || c.effective_status === "ACTIVE") {
        return NextResponse.json({ error: `refusing: ${c.name} is ${c.effective_status} / ${c.objective}` }, { status: 400 });
      }
      await meta.metaGraph(body.campaignId, "POST", { status: "DELETED" });
      return NextResponse.json({ ok: true, deleted: c.name });
    } catch (e) {
      return NextResponse.json({ error: err(e) }, { status: 500 });
    }
  }

  if (body.action === "activate") {
    if (!body.campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
    try {
      await meta.setStatus(body.campaignId, "campaign", "ACTIVE");
      const sets = await meta.metaGraph(`${body.campaignId}/adsets`, "GET", { fields: "id", limit: "20" });
      for (const s of (sets.data as { id: string }[]) ?? []) {
        await meta.setStatus(s.id, "adset", "ACTIVE");
        const ads = await meta.metaGraph(`${s.id}/ads`, "GET", { fields: "id", limit: "20" });
        for (const a of (ads.data as { id: string }[]) ?? []) await meta.setStatus(a.id, "ad", "ACTIVE");
      }
      const check = await meta.metaGraph(body.campaignId, "GET", { fields: "name,effective_status" });
      return NextResponse.json({ ok: true, check });
    } catch (e) {
      return NextResponse.json({ error: err(e) }, { status: 500 });
    }
  }

  // ── create (or "add": ads into existing app ad sets) ──────────────────
  const adding = body.action === "add";
  if (adding ? !body.adsets || !body.ads?.length : !body.appId || !body.ads?.length || !body.budgets) {
    return NextResponse.json({ error: adding ? "adsets and ads required" : "appId, budgets and ads required" }, { status: 400 });
  }
  const steps: Record<string, unknown> = {};
  const budgets = body.budgets ?? {};
  const wanted = body.ads ?? [];
  try {
    const adsets: Partial<Record<Group, string>> = { ...(body.adsets ?? {}) };
    if (!adding && body.mode === "aac") {
      const campaigns: Partial<Record<Group, string>> = {};
      steps.campaigns = campaigns;
      for (const group of ["women", "men"] as Group[]) {
        const budget = Math.round(Number(budgets[group]));
        if (!budget || !wanted.some((a) => a.group === group)) continue;
        const label = group === "women" ? "Women" : "Men";
        const project = await prisma.adLabProject.findUniqueOrThrow({
          where: { slug: group === "women" ? "ripple-women" : "ripple-men" },
          select: { evergreenAdsetId: true },
        });
        // Advantage+ app campaigns take location only; copy the countries.
        let geo: Record<string, unknown> = { countries: ["US", "CA", "GB"] };
        if (project.evergreenAdsetId) {
          const main = (await meta.metaGraph(project.evergreenAdsetId, "GET", { fields: "targeting" })) as { targeting: { geo_locations?: Record<string, unknown> } };
          if (main.targeting.geo_locations) geo = main.targeting.geo_locations;
        }
        const campaign = await meta.metaGraph(`${acct}/campaigns`, "POST", {
          name: `Ripple — App Installs | ${label}`,
          objective: "OUTCOME_APP_PROMOTION",
          buying_type: "AUCTION",
          special_ad_categories: [],
          smart_promotion_type: "SMART_APP_PROMOTION",
          is_skadnetwork_attribution: true,
          // No bid_strategy or daily_budget on the campaign: Meta rejects both
          // for Advantage+ app campaigns ("Invalid campaign param … AAA ad").
          // The budget goes on the single ad set below.
          status: "PAUSED",
        });
        campaigns[group] = campaign.id as string;
        const set = await meta.metaGraph(`${acct}/adsets`, "POST", {
          name: `Ripple — App Installs | ${label}`,
          campaign_id: campaign.id,
          daily_budget: String(budget),
          billing_event: "IMPRESSIONS",
          optimization_goal: "APP_INSTALLS",
          promoted_object: { application_id: body.appId, object_store_url: body.storeUrl ?? APP_STORE_URL },
          targeting: { geo_locations: geo },
          status: "PAUSED",
        });
        adsets[group] = set.id as string;
      }
    } else if (!adding) {
    const campaign = await meta.metaGraph(`${acct}/campaigns`, "POST", {
      name: "Ripple — iOS App Installs",
      objective: "OUTCOME_APP_PROMOTION",
      buying_type: "AUCTION",
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
      // An "iOS 14+ campaign" (SKAdNetwork). Without it Meta caps targeting
      // at iOS 14.4, and it can't be switched on after creation (2026-10-19).
      is_skadnetwork_attribution: true,
      status: "PAUSED",
    });
    const campaignId = campaign.id as string;
    steps.campaignId = campaignId;

    for (const group of ["women", "men"] as Group[]) {
      const budget = Math.round(Number(budgets[group]));
      if (!budget || !wanted.some((a) => a.group === group)) continue;
      const project = await prisma.adLabProject.findUniqueOrThrow({
        where: { slug: group === "women" ? "ripple-women" : "ripple-men" },
        select: { evergreenAdsetId: true },
      });
      if (!project.evergreenAdsetId) throw new Error(`${group}: no evergreen ad set to copy targeting from`);
      const main = (await meta.metaGraph(project.evergreenAdsetId, "GET", { fields: "targeting" })) as { targeting: Record<string, unknown> };
      // iOS only: Android is still on 1.5.0 (2026-10-19). A bare "iOS" is
      // read by Meta as iOS 2.0-14.4; the app needs iOS 16.4+ (app.json deploymentTarget).
      const targeting = { ...main.targeting, user_os: [IOS_OS] };
      delete (targeting as Record<string, unknown>).user_device;
      const set = await meta.metaGraph(`${acct}/adsets`, "POST", {
        name: `Ripple — iOS App Installs | ${group === "women" ? "Women" : "Men"}`,
        campaign_id: campaignId,
        daily_budget: String(budget),
        billing_event: "IMPRESSIONS",
        optimization_goal: "APP_INSTALLS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        promoted_object: { application_id: body.appId, object_store_url: body.storeUrl ?? APP_STORE_URL },
        targeting,
        // iOS 14+ campaigns: each ad set names its measurement (Apple's
        // SKAdNetwork); without it Meta rejects the ad set (2026-10-19).
        ...(body.attribution === "none" ? {} : { campaign_attribution: body.attribution ?? "SKADNETWORK" }),
        status: "PAUSED",
      });
      adsets[group] = set.id as string;
    }
    }
    steps.adsets = adsets;

    const ads: Record<string, unknown>[] = [];
    for (const src of wanted) {
      const adsetId = adsets[src.group];
      if (!adsetId) {
        ads.push({ sourceAdId: src.sourceAdId, skipped: "no ad set for group" });
        continue;
      }
      try {
        // Meta's creative spec is loosely typed; read it as-is.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const source = (await meta.metaGraph(src.sourceAdId, "GET", {
          fields: "name,creative{object_story_spec,asset_feed_spec,body,title,thumbnail_url}",
        })) as { name: string; creative: { object_story_spec?: Record<string, any>; asset_feed_spec?: Record<string, any>; body?: string; title?: string; thumbnail_url?: string } };
        const oss = source.creative.object_story_spec ?? {};
        const cta = { type: "INSTALL_MOBILE_APP", value: { link: APP_STORE_URL } };
        let spec: Record<string, unknown>;
        if (oss.video_data) {
          const v = oss.video_data;
          spec = {
            page_id: oss.page_id,
            ...(oss.instagram_user_id ? { instagram_user_id: oss.instagram_user_id } : {}),
            video_data: {
              video_id: v.video_id,
              ...(v.image_hash ? { image_hash: v.image_hash } : { image_url: v.image_url ?? source.creative.thumbnail_url }),
              message: v.message ?? source.creative.body ?? "",
              title: v.title ?? source.creative.title ?? "",
              call_to_action: cta,
            },
          };
        } else if (oss.link_data) {
          const l = oss.link_data;
          spec = {
            page_id: oss.page_id,
            ...(oss.instagram_user_id ? { instagram_user_id: oss.instagram_user_id } : {}),
            link_data: {
              link: APP_STORE_URL,
              ...(l.image_hash ? { image_hash: l.image_hash } : { picture: l.picture ?? source.creative.thumbnail_url }),
              message: l.message ?? source.creative.body ?? "",
              name: l.name ?? source.creative.title ?? "",
              call_to_action: cta,
            },
          };
        } else if (source.creative.asset_feed_spec?.images?.length) {
          // Placement-customized image ads (asset feed): rebuilt as a single
          // image (the feed's first image, usually the 4:5 one) with the
          // feed's first primary text and headline (2026-10-19).
          const f = source.creative.asset_feed_spec;
          spec = {
            page_id: oss.page_id,
            ...(oss.instagram_user_id ? { instagram_user_id: oss.instagram_user_id } : {}),
            link_data: {
              link: APP_STORE_URL,
              image_hash: f.images[0].hash,
              message: f.bodies?.[0]?.text ?? source.creative.body ?? "",
              name: f.titles?.[0]?.text ?? source.creative.title ?? "",
              call_to_action: cta,
            },
          };
        } else {
          ads.push({ sourceAdId: src.sourceAdId, name: source.name, skipped: "creative has no video, image or asset feed to reuse" });
          continue;
        }
        const name = `App | ${source.name}`.slice(0, 200);
        const creative = await meta.metaGraph(`${acct}/adcreatives`, "POST", { name, object_story_spec: spec });
        const ad = await meta.metaGraph(`${acct}/ads`, "POST", {
          name,
          adset_id: adsetId,
          creative: { creative_id: creative.id },
          status: "PAUSED",
        });
        ads.push({ sourceAdId: src.sourceAdId, name: source.name, group: src.group, adId: ad.id });
      } catch (e) {
        ads.push({ sourceAdId: src.sourceAdId, error: err(e) });
      }
    }
    steps.ads = ads;
    return NextResponse.json({ ok: true, paused: true, ...steps });
  } catch (e) {
    return NextResponse.json({ error: err(e), steps }, { status: 500 });
  }
}
