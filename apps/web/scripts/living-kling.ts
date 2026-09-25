/**
 * Living reels on Kling 3.0 for a day's posts (2026-09-25, per Keenan: "for
 * tomorrow's run on instagram/meta, make the videos with the newer
 * higgsfield model… send me the videos separately from the picture slides").
 *
 * Kling 3.0 only exists on the Higgsfield APP account (the chat MCP), not
 * the developer API the Inngest pipeline uses (DoP models only). So this is
 * a two-phase ops script with the clip generation done in between:
 *
 *   1. prep <YYYY-MM-DD> <out.json>
 *      For every reel-lane post generated that day: text-free base frame +
 *      text layer per slide, uploaded to living/<postId>/, plus the motion
 *      prompt. Writes the plan.
 *   2. (generate one 5s Kling 3.0 clip per base frame, 9:16, sound off)
 *   3. assemble <plan.json> <clips.json>
 *      clips.json = { "<postId>": ["<clip url>", ...] } in slide order.
 *      Builds each reel with brand music + CTA, uploads it to
 *      reels/<postId>.mp4 (the path the IG/FB publisher already reuses) and
 *      living/<postId>/reel.mp4, then emails each video on its own.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/living-kling.ts …
 */
import { config } from "dotenv";
config({ path: "/Users/reviewwave/Acuity/apps/web/.env.local" });
config({ path: "/Users/reviewwave/Acuity/.env", override: true });
import * as fs from "fs";

type PlanPost = {
  postId: string;
  lane: string;
  brand: string;
  headline: string;
  caption: string;
  slides: { baseUrl: string; layerUrl: string; seconds: number; prompt: string }[];
};

async function upload(path: string, buf: Buffer, type: string): Promise<string> {
  const { supabase } = await import("@/lib/supabase.server");
  const { error } = await supabase.storage.from("content-factory").upload(path, buf, { contentType: type, upsert: true });
  if (error) throw new Error(`Upload failed (${path}): ${error.message}`);
  return supabase.storage.from("content-factory").getPublicUrl(path).data.publicUrl;
}

async function prep(date: string, out: string) {
  const { prisma } = await import("@/lib/prisma");
  const { laneWantsReel, laneBrand } = await import("@/lib/content-factory/social-publish");
  const { buildLivingSlideLayer, livingMotionPrompt, livingSlideSeconds } = await import("@/lib/content-factory/living-reel");
  const { regenerateOverlayRaw } = await import("@/lib/content-factory/carousel-generate");
  const day = new Date(`${date}T00:00:00Z`);
  const posts = await prisma.carouselPost.findMany({
    where: { generatedFor: { gte: day, lt: new Date(day.getTime() + 86_400_000) }, lane: { not: null } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, lane: true, headline: true, caption: true,
      slides: {
        where: { kind: { notIn: ["SCENE", "CTA"] } },
        orderBy: { order: "asc" },
        select: { id: true, kind: true, overlayText: true, imagePrompt: true, rawImageUrl: true },
      },
    },
  });
  const plan: PlanPost[] = [];
  for (const p of posts) {
    if (!laneWantsReel(p.lane)) continue;
    // Only overlay-style slides (moody lanes) can be split into photo + text.
    if (!p.slides.every((s) => /DIM and shadowed|SOFT and LIGHT/.test(s.imagePrompt ?? ""))) {
      console.log(`skip ${p.lane} "${p.headline}" (not an overlay-style post)`);
      continue;
    }
    const slides = await Promise.all(
      p.slides.map(async (s, i) => {
        let raw: Buffer | null = null;
        if (s.rawImageUrl) {
          const r = await fetch(s.rawImageUrl);
          if (r.ok) raw = Buffer.from(await r.arrayBuffer());
        }
        if (!raw) raw = await regenerateOverlayRaw(s.imagePrompt, p.lane, s.kind === "COVER" ? "cover" : "item");
        const { base, layer } = await buildLivingSlideLayer({ raw, overlayText: s.overlayText, lane: p.lane, slideKind: s.kind, imagePrompt: s.imagePrompt });
        return {
          baseUrl: await upload(`living/${p.id}/base-${i}.jpg`, base, "image/jpeg"),
          layerUrl: await upload(`living/${p.id}/layer-${i}.png`, layer, "image/png"),
          seconds: livingSlideSeconds(s.kind, s.overlayText),
          prompt: livingMotionPrompt(s.imagePrompt),
        };
      })
    );
    plan.push({ postId: p.id, lane: p.lane!, brand: await laneBrand(p.lane), headline: p.headline, caption: p.caption, slides });
    console.log(`prepped ${p.lane} "${p.headline}" (${slides.length} slides)`);
  }
  fs.writeFileSync(out, JSON.stringify(plan, null, 1));
  console.log(`plan: ${plan.length} posts, ${plan.reduce((a, p) => a + p.slides.length, 0)} clips`);
}

async function assemble(planPath: string, clipsPath: string) {
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as PlanPost[];
  const clips = JSON.parse(fs.readFileSync(clipsPath, "utf8")) as Record<string, string[]>;
  const { assembleLivingReel } = await import("@/lib/content-factory/living-reel");
  const { pickMusicTrack } = await import("@/lib/content-factory/slideshow-reel");
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const get = async (u: string) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Download failed (${r.status}): ${u}`);
    return Buffer.from(await r.arrayBuffer());
  };
  for (const p of plan) {
    const urls = clips[p.postId];
    if (!urls || urls.length !== p.slides.length) {
      console.log(`skip ${p.lane}: ${urls?.length ?? 0}/${p.slides.length} clips`);
      continue;
    }
    try {
      const music = await pickMusicTrack(p.lane);
      if (!music) throw new Error("no music");
      const { buf, seconds } = await assembleLivingReel({
        clips: await Promise.all(urls.map(get)),
        layers: await Promise.all(p.slides.map((s) => get(s.layerUrl))),
        seconds: p.slides.map((s) => s.seconds),
        clipSeconds: 5,
        ctaUrl: `https://goripple.io/cta-slide-${p.brand}.jpg`,
        musicUrl: music,
      });
      const reelUrl = await upload(`reels/${p.postId}.mp4`, buf, "video/mp4");
      await upload(`living/${p.postId}/reel.mp4`, buf, "video/mp4");
      const { prisma } = await import("@/lib/prisma");
      await prisma.carouselPost.update({ where: { id: p.postId }, data: { reelTransition: "living-kling3" } });
      const brandName = p.brand === "bwk" ? "BWK" : "Ripple";
      const { error } = await resend.emails.send({
        from: "Ripple Content <keenan@getacuity.io>",
        to: ["keenan@heelerdigital.com"],
        subject: `🎬 ${brandName} living reel (Kling 3.0): ${p.headline}`,
        html: `<p><b>${brandName}</b> · lane <b>${p.lane}</b> · ${p.slides.length} slides + end card · ${seconds.toFixed(1)}s</p>
<p>This is the video version. It posts to Instagram/Facebook in place of the photo slideshow. The picture slides come in their own email as usual.</p>
<p>Music: ${decodeURIComponent(music.split("/").pop() ?? "")}</p>
<p>Watch / download: <a href="${reelUrl}">${reelUrl}</a></p>
<p><b>Caption</b></p><pre style="white-space:pre-wrap;font-family:inherit">${p.caption.replace(/</g, "&lt;")}</pre>`,
        ...(buf.length < 30_000_000 ? { attachments: [{ filename: `${p.brand}-${p.lane}-living.mp4`, content: buf.toString("base64") }] } : {}),
      });
      console.log(`${p.lane}: reel ${seconds.toFixed(1)}s ${(buf.length / 1e6).toFixed(1)}MB, email ${error ? "FAILED " + JSON.stringify(error) : "sent"}`);
    } catch (e) {
      console.log(`${p.lane}: FAILED ${e instanceof Error ? e.message.slice(-400) : e}`);
    }
  }
}

(async () => {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === "prep") await prep(a, b);
  else if (mode === "assemble") await assemble(a, b);
  else console.log("usage: prep <date> <out.json> | assemble <plan.json> <clips.json>");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
