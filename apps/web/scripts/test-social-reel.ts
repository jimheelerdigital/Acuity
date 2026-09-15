/**
 * One-off: publish a REAL test Reel to Instagram + Facebook (Ripple
 * account) to verify the hybrid slideshow-reel pipeline end to end,
 * ahead of flipping SOCIAL_AUTOPUBLISH_ENABLED. Picks the newest
 * memento/selfie post, renders slides + library music into an MP4
 * (or reuses an already-rendered reels/{id}.mp4), and publishes.
 *
 *   npx vercel env pull /tmp/acuity-prod.env --environment=production
 *   cd apps/web && npx tsx scripts/test-social-reel.ts
 *
 * Deliberately does NOT import supabase.server ("server-only" throws
 * under tsx) — builds its own service-role client from the pulled env.
 */

import { config } from "dotenv";

config({ path: "/tmp/acuity-prod.env" });

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import {
  resolveAccount,
  publishIgReel,
  publishFbVideo,
} from "@/lib/content-factory/social-publish";
import { renderSlideshowReel } from "@/lib/content-factory/slideshow-reel";

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|mp4)$/i;

async function main() {
  for (const k of [
    "IG_ACCESS_TOKEN",
    "IG_USER_ID",
    "FB_PAGE_ID",
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!process.env[k]) throw new Error(`${k} missing from pulled env`);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const prisma = new PrismaClient();

  const post = await prisma.carouselPost.findFirst({
    where: { lane: { in: ["memento", "selfie"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      lane: true,
      headline: true,
      caption: true,
      slides: {
        where: { kind: { not: "SCENE" } },
        orderBy: { order: "asc" },
        select: { imageUrl: true },
      },
    },
  });
  if (!post || post.slides.length === 0) {
    throw new Error("No memento/selfie post with slides found");
  }
  console.log(
    `Post: ${post.headline} (lane=${post.lane}, ${post.slides.length} slides, id=${post.id})`
  );

  // ── Reel MP4: reuse if already rendered, else render + upload ──────
  const storagePath = `reels/${post.id}.mp4`;
  const publicUrl = supabase.storage
    .from("content-factory")
    .getPublicUrl(storagePath).data.publicUrl;
  const head = await fetch(publicUrl, { method: "HEAD" });
  if (head.ok) {
    console.log(`Reusing already-rendered reel: ${publicUrl}`);
  } else {
    const { data, error } = await supabase.storage
      .from("content-factory")
      .list("music/ripple", { limit: 200 });
    if (error) throw new Error(`Music list failed: ${error.message}`);
    const tracks = (data ?? []).filter((f) => AUDIO_EXT.test(f.name));
    if (tracks.length === 0) {
      throw new Error(
        "music/ripple is empty — upload an MP3 to the content-factory bucket first"
      );
    }
    const track = tracks[Math.floor(Math.random() * tracks.length)];
    const musicUrl = supabase.storage
      .from("content-factory")
      .getPublicUrl(`music/ripple/${track.name}`).data.publicUrl;
    console.log(`Rendering reel with track: ${track.name}`);

    const buf = await renderSlideshowReel(
      post.slides.map((s) => s.imageUrl),
      musicUrl
    );
    let uploaded = false;
    for (let i = 0; i < 3 && !uploaded; i++) {
      const { error: upErr } = await supabase.storage
        .from("content-factory")
        .upload(storagePath, buf, { contentType: "video/mp4", upsert: true });
      if (!upErr) {
        uploaded = true;
      } else {
        console.error(`Upload attempt ${i + 1} failed:`, upErr);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!uploaded) throw new Error("Reel upload failed after 3 attempts");
    console.log(`Rendered + uploaded ${(buf.length / 1e6).toFixed(1)}MB: ${publicUrl}`);
  }

  const account = resolveAccount(post.lane);
  if (!account) throw new Error("No Meta account resolved (IG_ACCESS_TOKEN missing?)");
  const caption = post.caption ?? post.headline;

  console.log("Publishing IG Reel (video processing can take ~1-3 min)...");
  const ig = await publishIgReel(account, publicUrl, caption);
  console.log(`✅ Instagram Reel: ${ig.permalink ?? `media id ${ig.externalId}`}`);

  console.log("Publishing FB video...");
  const fb = await publishFbVideo(account, publicUrl, caption);
  console.log(`✅ Facebook video: ${fb.permalink ?? `video id ${fb.externalId}`}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
