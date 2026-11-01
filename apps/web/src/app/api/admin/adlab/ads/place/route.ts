/**
 * POST /api/admin/adlab/ads/place — put AdLab creatives into EXISTING Meta ad
 * sets of any campaign (2026-11-01, per Keenan: "add these to ALL the
 * different planner ads, along with men and women evergreen signups ... also
 * add to app installs for women").
 *
 * action "inspect": { campaignIds } → ad sets, budgets and live ads with
 *   each ad's link + button (read-only).
 * action "add": { creativeIds, adsetIds, status?, path? } → one ad per
 *   creative per ad set. Each ad copies the destination of a live ad already
 *   in that ad set (link, button, url_tags), so planner ads keep their
 *   early-bird price pin and app-install ads keep the App Store link; web
 *   links get utm_content=<creativeId>. `path` swaps the goripple.io path
 *   (e.g. "/start-journal"). Feed + Stories images per placement. Registered
 *   as AdLabAd rows so the daily audit judges them. status defaults PAUSED.
 * action "relink": { adsetIds, path } → every live ad in those ad sets gets
 *   a copy of its creative with the goripple.io path swapped, in place.
 * action "status": { adIds, status } → ACTIVE / PAUSED, mirrored on AdLabAd.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Json = Record<string, unknown>;

const err = (e: unknown) => meta.redactAccessToken(e instanceof Error ? e.message : String(e));

/** The destination of an existing ad's creative. */
function destinationOf(cr: Json): { link: string | null; cta: string | null } {
  const afs = cr.asset_feed_spec as Json | undefined;
  if (afs) {
    const link = ((afs.link_urls as Json[] | undefined)?.[0]?.website_url as string | undefined) ?? null;
    const cta = ((afs.call_to_action_types as string[] | undefined) ?? [])[0] ?? null;
    if (link) return { link, cta };
  }
  const oss = (cr.object_story_spec ?? {}) as Json;
  const ld = oss.link_data as Json | undefined;
  if (ld) {
    const c = ld.call_to_action as Json | undefined;
    return { link: (ld.link as string) ?? ((c?.value as Json | undefined)?.link as string) ?? null, cta: (c?.type as string) ?? null };
  }
  const vd = oss.video_data as Json | undefined;
  if (vd) {
    const c = vd.call_to_action as Json | undefined;
    return { link: ((c?.value as Json | undefined)?.link as string) ?? null, cta: (c?.type as string) ?? null };
  }
  return { link: null, cta: null };
}

function withPath(url: string, path?: string): string {
  if (!path || !/goripple\.io/i.test(url)) return url;
  const u = new URL(url);
  u.pathname = path;
  return u.toString();
}

async function liveAds(adsetId: string) {
  const r = (await meta.metaGraph(`${adsetId}/ads`, "GET", {
    fields: "id,name,effective_status,creative{id,name,url_tags,object_story_spec,asset_feed_spec}",
    effective_status: ["ACTIVE", "PENDING_REVIEW", "IN_PROCESS", "WITH_ISSUES"],
    limit: 50,
  })) as { data: (Json & { id: string; name: string; creative: Json & { id: string } })[] };
  return r.data;
}

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    campaignIds?: string[];
    creativeIds?: string[];
    adsetIds?: string[];
    adIds?: string[];
    status?: "ACTIVE" | "PAUSED";
    path?: string;
  };
  const acct = meta.adAccountPath();

  if (body.action === "inspect") {
    const out: Json[] = [];
    for (const cid of body.campaignIds ?? []) {
      try {
        const c = await meta.metaGraph(cid, "GET", { fields: "name,objective,daily_budget,effective_status" });
        const sets = (await meta.metaGraph(`${cid}/adsets`, "GET", {
          fields: "id,name,daily_budget,effective_status,optimization_goal,promoted_object",
          limit: 50,
        })) as { data: Json[] };
        const adsets: Json[] = [];
        for (const s of sets.data) {
          if (s.effective_status !== "ACTIVE") continue;
          const ads = await liveAds(s.id as string);
          adsets.push({
            ...s,
            ads: ads.map((a) => ({ id: a.id, name: a.name, status: a.effective_status, ...destinationOf(a.creative), urlTags: a.creative.url_tags ?? null })),
          });
        }
        out.push({ campaignId: cid, ...c, adsets });
      } catch (e) {
        out.push({ campaignId: cid, error: err(e) });
      }
    }
    return NextResponse.json(out);
  }

  if (body.action === "add") {
    const status = body.status === "ACTIVE" ? "ACTIVE" : "PAUSED";
    if (!body.creativeIds?.length || !body.adsetIds?.length) {
      return NextResponse.json({ error: "creativeIds and adsetIds required" }, { status: 400 });
    }
    const creatives = await prisma.adLabCreative.findMany({
      where: { id: { in: body.creativeIds } },
      include: { angle: { include: { experiment: { include: { project: true } } } } },
    });
    const hashes = new Map<string, { feed: string; story: string }>();
    const out: Json[] = [];
    for (const adsetId of body.adsetIds) {
      let template: { link: string; cta: string | null; urlTags: string | null; campaignId: string };
      try {
        const set = (await meta.metaGraph(adsetId, "GET", { fields: "campaign_id" })) as { campaign_id: string };
        const src = (await liveAds(adsetId)).map((a) => ({ a, d: destinationOf(a.creative) })).find((x) => x.d.link);
        if (!src) throw new Error("no live ad with a link to copy the destination from");
        template = { link: src.d.link!, cta: src.d.cta, urlTags: (src.a.creative.url_tags as string) ?? null, campaignId: set.campaign_id };
      } catch (e) {
        out.push({ adsetId, error: err(e) });
        continue;
      }
      const isApp = !/goripple\.io/i.test(template.link);
      for (const c of creatives) {
        try {
          const pageId = c.angle.experiment.project.metaPageId;
          if (!pageId || !c.imageUrl) throw new Error("creative missing page or image");
          let h = hashes.get(c.id);
          if (!h) {
            const feed = await meta.uploadImage(c.imageUrl);
            const story = c.storyImageUrl ? await meta.uploadImage(c.storyImageUrl) : feed;
            h = { feed, story };
            hashes.set(c.id, h);
          }
          let link = template.link;
          if (!isApp) {
            const u = new URL(withPath(template.link, body.path));
            u.searchParams.set("utm_content", c.id);
            link = u.toString();
          }
          const cta = template.cta ?? (isApp ? "INSTALL_MOBILE_APP" : meta.mapCtaType(c.cta));
          const params: Json = {
            name: `${c.headline} | ${c.formatKey ?? "adlab"} | ${adsetId}`.slice(0, 200),
            object_story_spec: { page_id: pageId, ...(process.env.META_ADS_IG_USER_ID || process.env.IG_USER_ID ? { instagram_user_id: (process.env.META_ADS_IG_USER_ID || process.env.IG_USER_ID)!.trim() } : {}) },
            asset_feed_spec: {
              images: [
                { hash: h.feed, adlabels: [{ name: "feed_img" }] },
                { hash: h.story, adlabels: [{ name: "story_img" }] },
              ],
              bodies: [{ text: c.primaryText }],
              titles: [{ text: c.headline }],
              descriptions: [{ text: c.description }],
              link_urls: [{ website_url: link }],
              call_to_action_types: [cta],
              ad_formats: ["SINGLE_IMAGE"],
              optimization_type: "PLACEMENT",
              asset_customization_rules: [
                {
                  customization_spec: {
                    publisher_platforms: ["facebook", "instagram", "messenger"],
                    facebook_positions: ["story", "facebook_reels"],
                    instagram_positions: ["story", "reels"],
                    messenger_positions: ["story"],
                  },
                  image_label: { name: "story_img" },
                  priority: 1,
                },
                { customization_spec: { publisher_platforms: ["facebook", "instagram", "audience_network", "messenger"] }, image_label: { name: "feed_img" }, priority: 2 },
              ],
            },
          };
          if (template.urlTags) params.url_tags = template.urlTags;
          const cr = await meta.metaGraph(`${acct}/adcreatives`, "POST", params);
          const ad = await meta.metaGraph(`${acct}/ads`, "POST", {
            name: `${c.headline} | ${c.formatKey ?? "adlab"}`.slice(0, 200),
            adset_id: adsetId,
            creative: { creative_id: cr.id },
            status,
          });
          await prisma.adLabAd.create({
            data: {
              creativeId: c.id,
              metaCampaignId: template.campaignId,
              metaAdsetId: adsetId,
              metaAdId: ad.id as string,
              status: status === "ACTIVE" ? "live" : "paused",
              launchedAt: status === "ACTIVE" ? new Date() : null,
            },
          });
          await prisma.adLabCreative.update({ where: { id: c.id }, data: { approved: true } });
          out.push({ adsetId, creativeId: c.id, headline: c.headline, adId: ad.id, link, cta, status });
        } catch (e) {
          out.push({ adsetId, creativeId: c.id, headline: c.headline, error: err(e) });
        }
      }
    }
    return NextResponse.json(out);
  }

  if (body.action === "relink") {
    if (!body.adsetIds?.length || !body.path?.startsWith("/")) {
      return NextResponse.json({ error: "adsetIds and path required" }, { status: 400 });
    }
    const out: Json[] = [];
    for (const adsetId of body.adsetIds) {
      for (const a of await liveAds(adsetId).catch(() => [])) {
        try {
          const cr = (await meta.metaGraph(a.creative.id, "GET", { fields: "name,object_story_spec,url_tags,asset_feed_spec" })) as Json;
          const before = destinationOf(cr).link;
          if (!before || !/goripple\.io/i.test(before)) {
            out.push({ adId: a.id, name: a.name, skipped: "not a goripple.io link" });
            continue;
          }
          if (new URL(before).pathname === body.path) {
            out.push({ adId: a.id, name: a.name, skipped: "already there" });
            continue;
          }
          const swap = (o: unknown) =>
            JSON.parse(JSON.stringify(o).replace(/https?:\/\/(?:www\.)?goripple\.io[^"]*/g, (m) => withPath(m, body.path)));
          const spec = swap(cr.object_story_spec ?? {}) as Json;
          const vd = spec.video_data as Json | undefined;
          if (vd) delete vd.image_url; // Meta rejects image_url + image_hash together
          const params: Json = { name: `${String(cr.name ?? a.name)} | ${body.path}`.slice(0, 200), object_story_spec: spec };
          if (cr.url_tags) params.url_tags = cr.url_tags;
          if (cr.asset_feed_spec) params.asset_feed_spec = swap(cr.asset_feed_spec);
          const newCr = await meta.metaGraph(`${acct}/adcreatives`, "POST", params);
          await meta.metaGraph(a.id, "POST", { creative: { creative_id: newCr.id } });
          const check = (await meta.metaGraph(a.id, "GET", { fields: "creative{id,object_story_spec,asset_feed_spec}" })) as Json;
          out.push({ adId: a.id, name: a.name, before, after: destinationOf(check.creative as Json).link });
        } catch (e) {
          out.push({ adId: a.id, name: a.name, error: err(e) });
        }
      }
    }
    return NextResponse.json(out);
  }

  if (body.action === "status") {
    const status = body.status === "ACTIVE" ? "ACTIVE" : "PAUSED";
    const out: Json[] = [];
    for (const id of body.adIds ?? []) {
      try {
        await meta.setStatus(id, "ad", status);
        await prisma.adLabAd.updateMany({
          where: { metaAdId: id },
          data: status === "ACTIVE" ? { status: "live", launchedAt: new Date() } : { status: "paused" },
        });
        out.push({ adId: id, ...(await meta.metaGraph(id, "GET", { fields: "name,effective_status" })) });
      } catch (e) {
        out.push({ adId: id, error: err(e) });
      }
    }
    return NextResponse.json(out);
  }

  return NextResponse.json({ error: "action must be inspect | add | relink | status" }, { status: 400 });
}
