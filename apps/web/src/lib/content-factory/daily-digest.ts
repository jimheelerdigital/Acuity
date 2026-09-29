/**
 * Content Factory — the DAILY DIGEST (2026-09-26, per Keenan: "send all
 * BWK emails and final videos at once with a one click download packet
 * that lets me download every single file (all image slides and the
 * video with one click), and then the same thing for ripple").
 *
 * Replaces the one-email-per-post flow for the daily lanes. Once every
 * post a brand generated that day has its finished Higgsfield video (or
 * the 13:00 UTC deadline hits), ONE email goes out per brand:
 *   - a single "Download everything" button → one ZIP in Storage
 *     (packets/<date>/<brand>-<date>.zip) with a folder per post holding
 *     every slide in order, the brand end card, the final video and the
 *     caption as a text file;
 *   - a card per post: lane, headline, a strip of all its slides, the
 *     video link and the caption ready to copy.
 * Sent once per brand per day (claim file digests/<date>-<brand>.json).
 */

import JSZip from "jszip";
import type { SocialAccountKey } from "./social-publish";
import type { VideoBuildMarker } from "./post-video";

const BUCKET = "content-factory";
const FROM_ADDRESS =
  process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>';
const TO_ADDRESS = process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com";

export const BRAND_NAME: Record<SocialAccountKey, string> = {
  bwk: "Build With Key",
  ripple: "Ripple",
  mythicals: "Legendary Mythicals",
};

export interface DigestPost {
  id: string;
  lane: string;
  laneName: string;
  headline: string;
  caption: string;
  slides: { kind: string; imageUrl: string }[];
  marker: VideoBuildMarker | null;
  videoUrl: string | null;
}

export interface DigestState {
  brand: SocialAccountKey;
  date: string;
  posts: DigestPost[];
  /** Lanes scheduled for this brand that produced no post today. */
  missingLanes: string[];
  /** Posts whose video is still building. */
  building: string[];
  alreadySent: boolean;
}

function claimPath(brand: SocialAccountKey, date: string): string {
  return `digests/${date}-${brand}.json`;
}

function publicUrl(path: string, supabase: Awaited<typeof import("@/lib/supabase.server")>["supabase"]): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Where a brand's day stands: which posts exist, which videos are done. */
export async function getDigestState(brand: SocialAccountKey, date: string): Promise<DigestState> {
  const { prisma } = await import("@/lib/prisma");
  const { supabase } = await import("@/lib/supabase.server");
  const { laneBrand, trimLegacyPickList } = await import("./social-publish");
  const { readVideoMarker, isVideoPending, reelPath } = await import("./post-video");

  const laneRows = await prisma.contentLane.findMany({
    where: { status: { not: "RETIRED" } },
    select: { key: true, name: true, hoursUtc: true },
    orderBy: { key: "asc" },
  });
  const lanes: typeof laneRows = [];
  for (const l of laneRows) if ((await laneBrand(l.key)) === brand) lanes.push(l);
  const laneName = new Map(lanes.map((l) => [l.key, l.name]));

  const day = new Date(`${date}T00:00:00Z`);
  const rows = await prisma.carouselPost.findMany({
    where: { generatedFor: day, lane: { in: lanes.map((l) => l.key) } },
    orderBy: [{ lane: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      lane: true,
      headline: true,
      caption: true,
      slides: {
        where: { kind: { notIn: ["SCENE", "CTA"] } },
        orderBy: { order: "asc" },
        select: { kind: true, imageUrl: true },
      },
    },
  });

  const posts: DigestPost[] = [];
  const building: string[] = [];
  for (const p of rows) {
    const marker = await readVideoMarker(p.id);
    if (isVideoPending(marker)) building.push(p.id);
    const url = marker?.url ?? publicUrl(reelPath(p.id), supabase);
    const head = await fetch(url, { method: "HEAD" }).catch(() => null);
    posts.push({
      id: p.id,
      lane: p.lane!,
      laneName: laneName.get(p.lane!) ?? p.lane!,
      headline: p.headline,
      caption: p.caption,
      slides: trimLegacyPickList(p.slides),
      marker,
      videoUrl: head?.ok ? url : null,
    });
  }
  const withPosts = new Set(posts.map((p) => p.lane));
  const missingLanes = lanes
    .filter((l) => l.hoursUtc.length > 0 && !withPosts.has(l.key))
    .map((l) => l.name);

  const { data: claim } = await supabase.storage.from(BUCKET).download(claimPath(brand, date));
  return { brand, date, posts, missingLanes, building, alreadySent: !!claim };
}

function safeName(s: string, max = 48): string {
  return (
    s
      .replace(/[^A-Za-z0-9 _-]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
      .trim() || "post"
  );
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export interface DigestPacket {
  zipUrl: string;
  zipBytes: number;
  fileCount: number;
  /** Per post: a strip of every slide, for the email card. */
  stripUrls: Record<string, string>;
}

/**
 * Build the one-click ZIP (and the per-post slide strips). Files are
 * stored uncompressed — JPEGs and MP4s don't shrink, and STORE keeps the
 * build fast and memory-light.
 */
export async function buildDigestPacket(state: DigestState): Promise<DigestPacket> {
  const { supabase } = await import("@/lib/supabase.server");
  const { default: sharp } = await import("sharp");
  const root = `${BRAND_NAME[state.brand].replace(/\s+/g, "-")}-${state.date}`;
  const zip = new JSZip();
  const folder = zip.folder(root)!;
  const cta = await fetchBuffer(`https://goripple.io/cta-slide-${state.brand}.jpg`).catch(() => null);
  const stripUrls: Record<string, string> = {};
  let fileCount = 0;

  for (let n = 0; n < state.posts.length; n++) {
    const p = state.posts[n];
    const dir = folder.folder(`${String(n + 1).padStart(2, "0")} ${safeName(p.laneName, 32)} - ${safeName(p.headline)}`)!;
    const images: Buffer[] = [];
    for (let i = 0; i < p.slides.length; i++) {
      const buf = await fetchBuffer(p.slides[i].imageUrl);
      images.push(buf);
      const label = p.slides[i].kind === "COVER" ? "cover" : "slide";
      dir.file(`${String(i + 1).padStart(2, "0")}-${label}.jpg`, buf);
      fileCount++;
    }
    if (cta) {
      dir.file(`${String(p.slides.length + 1).padStart(2, "0")}-end-card.jpg`, cta);
      fileCount++;
    }
    if (p.videoUrl) {
      dir.file("video.mp4", await fetchBuffer(p.videoUrl));
      fileCount++;
    }
    dir.file("caption.txt", `${p.caption}\n`);
    fileCount++;

    // Slide strip: every slide at 120px wide, side by side.
    const thumbs = await Promise.all(
      images.map((b) => sharp(b).resize(120, 213, { fit: "cover" }).jpeg({ quality: 70 }).toBuffer())
    );
    const strip = await sharp({
      create: {
        width: Math.max(1, thumbs.length) * 126 - 6,
        height: 213,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite(thumbs.map((input, i) => ({ input, left: i * 126, top: 0 })))
      .jpeg({ quality: 75 })
      .toBuffer();
    const stripPath = `packets/${state.date}/${state.brand}-strip-${p.id}.jpg`;
    await supabase.storage.from(BUCKET).upload(stripPath, strip, { contentType: "image/jpeg", upsert: true });
    stripUrls[p.id] = publicUrl(stripPath, supabase);
  }

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  const zipPath = `packets/${state.date}/${root}.zip`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(zipPath, buf, { contentType: "application/zip", upsert: true });
  if (error) throw new Error(`Packet upload failed: ${error.message}`);
  // ?download= makes Storage answer with Content-Disposition: attachment.
  const zipUrl = `${publicUrl(zipPath, supabase)}?download=${encodeURIComponent(`${root}.zip`)}`;
  return { zipUrl, zipBytes: buf.length, fileCount, stripUrls };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function videoLabel(p: DigestPost): string {
  if (!p.videoUrl) return "No video — posts as a photo carousel";
  const m = p.marker;
  if (m?.source === "higgsfield") return `Higgsfield video · ${m.liveSlides} of ${m.totalSlides} slides animated`;
  if (m?.source === "stills") return "Video · text-in-photo slides, gentle push-in";
  return "Video";
}

export function renderDigestHtml(state: DigestState, packet: DigestPacket): string {
  const brandName = BRAND_NAME[state.brand];
  const dayLabel = new Date(`${state.date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const mb = (packet.zipBytes / 1_048_576).toFixed(0);
  const accent = state.brand === "bwk" ? "#1f2937" : "#f26b4f";

  const toc = state.posts
    .map(
      (p, n) =>
        `<tr><td style="padding:3px 10px 3px 0;color:#888;font-size:13px;">${n + 1}</td><td style="padding:3px 10px 3px 0;font-size:13px;color:#555;">${escapeHtml(p.laneName)}</td><td style="padding:3px 0;font-size:13px;"><a href="#post-${n + 1}" style="color:#111;text-decoration:none;">${escapeHtml(p.headline)}</a></td></tr>`
    )
    .join("");

  const cards = state.posts
    .map((p, n) => {
      const strip = packet.stripUrls[p.id];
      return `
<div id="post-${n + 1}" style="border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin:0 0 16px;">
  <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#888;margin-bottom:4px;">${n + 1} · ${escapeHtml(p.laneName)} · ${p.slides.length} slides</div>
  <div style="font-size:17px;font-weight:700;color:#111;margin-bottom:10px;">${escapeHtml(p.headline)}</div>
  ${strip ? `<a href="${p.videoUrl ?? p.slides[0]?.imageUrl}"><img src="${strip}" alt="Slides" style="display:block;max-width:100%;height:auto;border-radius:6px;margin-bottom:10px;"></a>` : ""}
  <div style="font-size:13px;color:#555;margin-bottom:10px;">🎬 ${escapeHtml(videoLabel(p))}${p.videoUrl ? ` · <a href="${p.videoUrl}" style="color:${accent};">Watch</a>` : ""}</div>
  <div style="font-size:12px;color:#888;margin-bottom:4px;">Caption</div>
  <div style="background:#f6f6f6;border-radius:8px;padding:10px 12px;font-size:14px;line-height:1.45;color:#222;white-space:pre-wrap;">${escapeHtml(p.caption)}</div>
</div>`;
    })
    .join("");

  const notes: string[] = [];
  if (state.missingLanes.length) {
    notes.push(`Not in today's batch (generation failed): ${state.missingLanes.map(escapeHtml).join(", ")}.`);
  }
  if (state.building.length) {
    notes.push(`${state.building.length} video(s) were still building at send time — those posts' folders have slides only.`);
  }

  return `<!doctype html><html><body style="margin:0;padding:0;background:#fff;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;">
  <div style="font-size:13px;color:#888;">${escapeHtml(dayLabel)}</div>
  <h1 style="font-size:24px;margin:4px 0 16px;">${escapeHtml(brandName)} · ${state.posts.length} post${state.posts.length === 1 ? "" : "s"} ready</h1>
  <a href="${packet.zipUrl}" style="display:block;text-align:center;background:${accent};color:#fff;text-decoration:none;font-weight:700;font-size:17px;padding:16px;border-radius:10px;">⬇ Download everything · ${packet.fileCount} files · ${mb} MB</a>
  <p style="font-size:13px;color:#666;line-height:1.5;margin:10px 0 20px;">One ZIP. Each folder is one post: the slides in order, the end card, the final video, and the caption.</p>
  ${notes.map((t) => `<p style="font-size:13px;color:#a15c00;background:#fff6e5;border-radius:8px;padding:10px 12px;margin:0 0 12px;">${t}</p>`).join("")}
  <table style="border-collapse:collapse;margin:0 0 20px;">${toc}</table>
  ${cards}
</div></body></html>`;
}

/** Why a digest can't go yet, or null when it can. */
export function digestBlocker(state: DigestState, force: boolean): string | null {
  if (state.alreadySent) return "already sent";
  if (state.posts.length === 0) return "no posts";
  if (!force && (state.missingLanes.length > 0 || state.building.length > 0)) {
    return `waiting: ${state.building.length} video(s) building; lanes not generated yet: ${state.missingLanes.join(", ") || "none"}`;
  }
  return null;
}

/** Send the digest email, then claim the day so it never sends twice. */
export async function sendDigestEmail(state: DigestState, packet: DigestPacket): Promise<void> {
  const { sendEmailOrThrow } = await import("@/lib/resend");
  const label = state.brand === "bwk" ? "[BUILD WITH KEY]" : "[RIPPLE]";
  const dayShort = new Date(`${state.date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  await sendEmailOrThrow({
    from: FROM_ADDRESS,
    to: TO_ADDRESS,
    subject: `${label} ${state.posts.length} post${state.posts.length === 1 ? "" : "s"} for ${dayShort} · one-click download`,
    html: renderDigestHtml(state, packet),
  });

  const { supabase } = await import("@/lib/supabase.server");
  await supabase.storage.from(BUCKET).upload(
    claimPath(state.brand, state.date),
    Buffer.from(
      JSON.stringify({ sentAt: new Date().toISOString(), posts: state.posts.map((p) => p.id), zip: packet.zipUrl })
    ),
    { contentType: "application/json", upsert: true }
  );
  const { prisma } = await import("@/lib/prisma");
  await prisma.carouselPost.updateMany({
    where: { id: { in: state.posts.map((p) => p.id) } },
    data: { emailedAt: new Date() },
  });
}
