/**
 * POST /api/admin/adlab/ugc-ad — run a UGC creator's video as its own Meta ad
 * (2026-10-14, per Keenan: "add this video into an adset and have it spend
 * $15/day"; first video from @therapyandthingss).
 *
 * action "create" (default): gives the ad its own ad set in the lane's
 * evergreen campaign (ensureDedicatedAdSet: same targeting + PURCHASE
 * optimization as MAIN) at budgetCents/day, uploads the video + thumbnail,
 * builds the creative pointing at the creator's tracking link, and creates
 * the ad. Ad set and ad are left PAUSED: nothing spends until Keenan says yes
 * (standing rule: never switch an ad live on Meta unasked). Also records a
 * UgcVideo row for the creator.
 *
 * action "activate": { adsetId, adId } → both ACTIVE.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface CreateBody {
  group: "women" | "men";
  handle: string;
  videoUrl: string;
  thumbUrl: string;
  linkUrl: string;
  primaryText: string;
  headline: string;
  description: string;
  cta?: string;
  label: string;
  budgetCents?: number;
  painBranch?: string;
}

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const meta = await import("@/lib/adlab/meta");
  const body = (await req.json().catch(() => ({}))) as Partial<CreateBody> & { action?: "create" | "activate"; adsetId?: string; adId?: string };

  if (body.action === "activate") {
    if (!body.adsetId || !body.adId) return NextResponse.json({ error: "adsetId and adId required" }, { status: 400 });
    try {
      await meta.setStatus(body.adsetId, "adset", "ACTIVE");
      await meta.setStatus(body.adId, "ad", "ACTIVE");
      const check = await meta.metaGraph(body.adId, "GET", { fields: "effective_status,adset{name,daily_budget,effective_status}" });
      return NextResponse.json({ ok: true, check });
    } catch (err) {
      return NextResponse.json({ error: meta.redactAccessToken(String(err)).slice(0, 400) }, { status: 500 });
    }
  }

  const b = body as CreateBody;
  for (const k of ["group", "handle", "videoUrl", "thumbUrl", "linkUrl", "primaryText", "headline", "description", "label"] as const) {
    if (!b[k]) return NextResponse.json({ error: `${k} required` }, { status: 400 });
  }
  const budgetCents = Math.min(Math.max(Math.round(Number(b.budgetCents) || 1500), 500), 10000);
  const steps: Record<string, unknown> = {};
  try {
    const { ensureDedicatedAdSet } = await import("@/lib/adlab/evergreen");
    const project = await prisma.adLabProject.findUniqueOrThrow({
      where: { slug: b.group === "women" ? "ripple-women" : "ripple-men" },
      select: { metaPageId: true },
    });
    if (!project.metaPageId) throw new Error("lane has no metaPageId");

    // 1. Own ad set at the budget (helper creates it ACTIVE) → paused at once.
    const set = await ensureDedicatedAdSet(b.group, b.label.replace(/[^a-zA-Z0-9 @'_-]+/g, "").slice(0, 50), budgetCents);
    await meta.setStatus(set.adsetId, "adset", "PAUSED");
    steps.adset = set;

    // 2. Assets.
    const videoId = await meta.uploadVideo(b.videoUrl);
    const imageHash = await meta.uploadImage(b.thumbUrl);
    steps.videoId = videoId;

    // 3. Creative + ad (createAd always creates PAUSED).
    const creativeId = await meta.createAdCreative({
      name: `UGC @${b.handle} | ${b.label}`,
      pageId: project.metaPageId,
      videoId,
      imageHash,
      headline: b.headline,
      primaryText: b.primaryText,
      description: b.description,
      cta: b.cta ?? "learn more",
      linkUrl: b.linkUrl,
    });
    const adId = await meta.createAd({ name: `UGC @${b.handle} | ${b.label}`, adsetId: set.adsetId, creativeId });
    steps.creativeId = creativeId;
    steps.adId = adId;

    // 4. Creator ledger (fees / spend / trials are filled in later).
    const creator = await prisma.ugcCreator.findFirst({ where: { handle: b.handle.toLowerCase().replace(/^@/, "") } });
    if (creator) {
      const n = await prisma.ugcVideo.count({ where: { creatorId: creator.id } });
      await prisma.ugcVideo
        .create({ data: { creatorId: creator.id, videoNumber: n + 1, hookVersion: "A", painBranch: b.painBranch ?? null, deliveredAt: new Date() } })
        .catch(() => undefined);
    }

    const check = await meta.metaGraph(adId, "GET", { fields: "effective_status,adset{name,daily_budget,effective_status}" });
    return NextResponse.json({ ok: true, paused: true, budgetCents, ...steps, check });
  } catch (err) {
    return NextResponse.json({ error: meta.redactAccessToken(String(err)).slice(0, 500), steps }, { status: 500 });
  }
}
