/**
 * Content Factory — carousel email delivery via Resend.
 *
 * Sends one email per carousel with composited slides attached (or linked
 * if total size > 15MB) and the caption in the body.
 */

import { getResendClient } from "@/lib/resend";

const FROM_ADDRESS =
  process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>';
const TO_ADDRESS =
  process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com";
const REVIEW_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://goripple.io";
// Resend's hard limit is 40MB per message AFTER base64 encoding (~1.37×).
// 28MB raw ≈ 38MB encoded, safely under. Was 15MB, which silently demoted
// the ~10-20MB animated covers to a download link on 3 of 5 daily emails.
const MAX_ATTACHMENT_BYTES = 28 * 1024 * 1024; // 28MB raw

/**
 * Links go through our /api/content-factory/download proxy, which streams
 * the file with Content-Disposition: attachment from our own domain — this
 * reliably triggers the native "Download" popup on iOS Safari. Direct
 * Supabase links (even with the ?download flag) get played inline by some
 * mail apps' in-app browsers, with no way to save the video.
 */
function forceDownloadUrl(url: string, filename: string): string {
  const bucketPath = url.split("/content-factory/")[1];
  if (!bucketPath) return url;
  return `${REVIEW_BASE_URL}/api/content-factory/download?path=${encodeURIComponent(bucketPath)}&name=${encodeURIComponent(filename)}`;
}

interface SlideRow {
  id: string;
  order: number;
  kind: string;
  overlayText: string;
  imageUrl: string;
  videoUrl: string | null;
}

interface PostRow {
  id: string;
  topicSlug: string;
  headline: string;
  caption: string;
  generatedFor: Date;
  emailedAt: Date | null;
  slides: SlideRow[];
}

/**
 * Send the carousel email. Guards on emailedAt unless `force` is true
 * (for the manual "Resend email" button).
 */
export async function sendCarouselEmail(
  carouselPostId: string,
  force = false
): Promise<{ emailId: string }> {
  const { prisma } = await import("@/lib/prisma");

  const post = await prisma.carouselPost.findUniqueOrThrow({
    where: { id: carouselPostId },
    include: { slides: { orderBy: { order: "asc" } } },
  }) as PostRow;

  if (post.emailedAt && !force) {
    console.log(`[carousel-email] Already emailed ${carouselPostId}, skipping`);
    return { emailId: "" };
  }

  const dateStr = post.generatedFor.toISOString().slice(0, 10);
  const lane = post.topicSlug;

  // ── Fetch slide images ──────────────────────────────────────────
  const slideBuffers: { filename: string; buf: Buffer; url: string }[] = [];
  let totalBytes = 0;

  for (const slide of post.slides) {
    try {
      const res = await fetch(slide.imageUrl);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const num = String(slide.order + 1).padStart(2, "0");
      slideBuffers.push({
        filename: `${num}-${slide.kind.toLowerCase()}.jpg`,
        buf,
        url: slide.imageUrl,
      });
      totalBytes += buf.length;
    } catch {
      console.warn(`[carousel-email] Failed to fetch slide ${slide.id}`);
    }
  }

  const useAttachments = totalBytes <= MAX_ATTACHMENT_BYTES;

  // ── Animated slide videos (fully animated posts have several) ───
  const videoSlides = post.slides.filter((s) => s.videoUrl);

  console.log(
    `[carousel-email] Video check for ${carouselPostId}: ${videoSlides.length} slide(s) with video, ` +
    `imageBytes=${totalBytes}, useAttachments=${totalBytes <= MAX_ATTACHMENT_BYTES}`
  );

  // Fetch every video. They are NOT attached to the main email — all six
  // won't fit under Resend's per-message cap alongside the images. Instead
  // they are stitched into ONE compilation MP4 (2026-08-12 per Keenan:
  // one slide-video email, pre-assembled — replaces his manual clipping)
  // and sent in a single follow-up email as a real attachment: tap and
  // hold → Save Video, straight from the email.
  const videoBuffers: { filename: string; buf: Buffer }[] = [];
  for (const slide of videoSlides) {
    try {
      const res = await fetch(slide.videoUrl!);
      console.log(`[carousel-email] Video fetch (slide ${slide.order}): status=${res.status}, size=${res.headers.get("content-length") ?? "unknown"}`);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const num = String(slide.order + 1).padStart(2, "0");
        videoBuffers.push({ filename: `${num}-${slide.kind.toLowerCase()}-animated.mp4`, buf });
      }
    } catch (err) {
      console.warn(`[carousel-email] Failed to fetch video for slide ${slide.order}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Build HTML ──────────────────────────────────────────────────
  const slideList = post.slides
    .map((s, i) => `<li style="margin-bottom:4px;color:#999;">${i + 1}. ${escapeHtml(s.overlayText)}</li>`)
    .join("\n");

  const coverUrl = post.slides[0]?.imageUrl ?? "";
  const reviewUrl = `${REVIEW_BASE_URL}/admin/content-factory/carousels`;

  // Always give big, thumb-friendly download buttons when videos exist —
  // attachments are awkward to save to the camera roll on a phone, the
  // hosted links are not. Shown whether or not the MP4s are also attached.
  const videoButtons = videoSlides
    .map((s) => {
      const label =
        s.kind === "COVER"
          ? "🎬 Download animated cover (MP4)"
          : `🎬 Download slide ${s.order + 1} animation (MP4)`;
      return `
      <a href="${escapeHtml(forceDownloadUrl(s.videoUrl!, `slide-${s.order + 1}-animated.mp4`))}" style="display:block;background:#F97E4E;color:#fff;font-weight:600;font-size:15px;padding:14px 20px;border-radius:12px;text-decoration:none;margin-bottom:8px;">
        ${label}
      </a>`;
    })
    .join("\n");
  const videoNote =
    videoSlides.length > 0
      ? `
    <div style="text-align:center;margin:20px 0;">
      ${videoButtons}
      <p style="font-size:11px;color:#888;margin:8px 0 0;">
        📥 A "Carousel video" email follows this one with every animated slide stitched into a single ready-to-post MP4 — tap and hold it there, then Save&nbsp;Video. Buttons above download individual slide clips as a backup.
      </p>
    </div>`
      : "";

  const attachNote = useAttachments
    ? `<p style="font-size:13px;color:#888;">📎 ${slideBuffers.length} slides attached — save to Photos and post.</p>`
    : `<p style="font-size:13px;color:#E06C75;font-weight:600;">⚠️ Attachments exceeded the size limit — images linked below instead.</p>` +
      slideBuffers
        .map((s) => `<p style="font-size:12px;"><a href="${escapeHtml(s.url)}" style="color:#F97E4E;">${escapeHtml(s.filename)}</a></p>`)
        .join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:500px;margin:0 auto;padding:20px;">
    ${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="Cover" style="width:100%;border-radius:12px;margin-bottom:16px;" />` : ""}

    <h1 style="font-size:20px;color:#FBFAF6;margin:0 0 4px;">${escapeHtml(post.headline)}</h1>
    <p style="font-size:12px;color:#888;margin:0 0 16px;">
      ${escapeHtml(lane)} · ${escapeHtml(dateStr)} · ${post.slides.length} slides
    </p>

    ${videoNote}
    ${attachNote}

    <div style="background:#1A1A1A;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#666;margin:0 0 8px;font-family:monospace;">Caption (select all to copy)</p>
      <pre style="white-space:pre-wrap;font-size:14px;color:#DDD;font-family:-apple-system,sans-serif;margin:0;line-height:1.5;">${escapeHtml(post.caption)}</pre>
    </div>

    <div style="margin:16px 0;">
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#666;margin:0 0 8px;font-family:monospace;">Slide texts</p>
      <ol style="padding-left:20px;margin:0;font-size:13px;">${slideList}</ol>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#F97E4E;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:999px;text-decoration:none;">
        Open Review Queue
      </a>
    </div>

    <p style="font-size:11px;color:#555;text-align:center;margin-top:20px;">
      Ripple Content Factory · Automated carousel delivery
    </p>
  </div>
</body>
</html>`.trim();

  // ── Plain text ──────────────────────────────────────────────────
  const text = [
    post.headline,
    `${lane} · ${dateStr} · ${post.slides.length} slides`,
    ...(videoSlides.length > 0
      ? [
          "",
          "── Animated slides (MP4) ──",
          ...videoSlides.map((s) =>
            `${s.kind === "COVER" ? "Cover" : `Slide ${s.order + 1}`}: ${forceDownloadUrl(s.videoUrl!, `slide-${s.order + 1}-animated.mp4`)}`
          ),
          "Links download the MP4 directly. On iPhone: open in Files, then Share → Save Video.",
        ]
      : []),
    "",
    "── Caption ──",
    post.caption,
    "",
    "── Slide texts ──",
    ...post.slides.map((s, i) => `${i + 1}. ${s.overlayText}`),
    "",
    `Review: ${reviewUrl}`,
  ].join("\n");

  // ── Send via Resend ─────────────────────────────────────────────
  const resend = getResendClient();

  const emailPayload: Parameters<typeof resend.emails.send>[0] = {
    from: FROM_ADDRESS,
    to: TO_ADDRESS,
    subject: `[Ripple Content] ${post.headline} — ${dateStr}`,
    html,
    text,
  };

  if (useAttachments && slideBuffers.length > 0) {
    (emailPayload as Record<string, unknown>).attachments = slideBuffers.map((s) => ({
      filename: s.filename,
      content: s.buf.toString("base64"),
    }));
  }

  const resp = await resend.emails.send(emailPayload);

  // Resend client shape varies — extract ID safely
  const respAny = resp as Record<string, unknown>;
  const dataObj = (respAny.data ?? respAny) as Record<string, unknown>;
  const emailId = (dataObj.id as string) ?? "";

  // ── Follow-up email: ONE stitched carousel video ────────────────
  // All slide videos (cover → reasons, text already burned in, silent)
  // are concatenated into a single ready-to-post MP4 so nothing needs
  // manual clipping. Exactly one follow-up email, attachment when it
  // fits under the Resend cap, force-download link otherwise. If the
  // stitch fails, the email still goes out with per-slide links.
  if (videoBuffers.length > 0) {
    let attachment: { filename: string; buf: Buffer } | null = null;
    let compilationUrl: string | null = null;
    try {
      if (videoBuffers.length === 1) {
        // Nothing to stitch (e.g. cover-only animation) — ship as-is.
        attachment = videoBuffers[0];
        compilationUrl = videoSlides[0]?.videoUrl ?? null;
      } else {
        const { stitchStoryVideo } = await import("./story-video");
        const stitched = await stitchStoryVideo(
          videoBuffers.map((v) => v.buf),
          null
        );
        const { uploadImage } = await import("./carousel-generate");
        compilationUrl = await uploadImage(
          stitched,
          `carousels/${dateStr}/${post.topicSlug}/slides-compilation.mp4`,
          "video/mp4"
        );
        attachment = { filename: `carousel-${dateStr}.mp4`, buf: stitched };
      }
    } catch (err) {
      console.error(
        `[carousel-email] Compilation stitch failed — sending links instead: ${err instanceof Error ? err.message : err}`
      );
    }

    const attachIt = attachment !== null && attachment.buf.length <= MAX_ATTACHMENT_BYTES;
    const compilationLink = compilationUrl
      ? forceDownloadUrl(compilationUrl, `carousel-${dateStr}.mp4`)
      : null;
    const linkList = compilationLink
      ? `<a href="${escapeHtml(compilationLink)}" style="display:block;background:#F97E4E;color:#fff;font-weight:600;font-size:15px;padding:14px 20px;border-radius:12px;text-decoration:none;">🎬 Download carousel video (MP4)</a>`
      : videoSlides
          .map((s) => `<p style="font-size:13px;"><a href="${escapeHtml(forceDownloadUrl(s.videoUrl!, `slide-${s.order + 1}-animated.mp4`))}" style="color:#F97E4E;">Download slide ${s.order + 1} animation</a></p>`)
          .join("\n");

    try {
      const videoEmail: Parameters<typeof resend.emails.send>[0] = {
        from: FROM_ADDRESS,
        to: TO_ADDRESS,
        subject: `[Ripple Content] 🎬 Carousel video — ${post.headline}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:500px;margin:0 auto;padding:20px;">
    <h1 style="font-size:18px;color:#FBFAF6;margin:0 0 8px;">🎬 Carousel video, ready to post</h1>
    <p style="font-size:13px;color:#AAA;margin:0 0 12px;">${escapeHtml(post.headline)}</p>
    <p style="font-size:14px;color:#DDD;line-height:1.6;margin:0 0 16px;">
      ${
        attachment
          ? `All ${videoBuffers.length > 1 ? `${videoBuffers.length} animated slides stitched into one MP4` : "the animated cover in one MP4"}${attachIt ? ", attached below" : ""}.<br/><strong>${attachIt ? "Tap and hold the video → Save Video" : "Use the download button below"}</strong> — no clipping needed.`
          : `The stitched video couldn't be built this time — download the individual slide clips below.`
      }
    </p>
    <div style="text-align:center;margin:16px 0;">${linkList}</div>
  </div>
</body>
</html>`.trim(),
        text: [
          `Carousel video — ${post.headline}`,
          attachment
            ? attachIt
              ? "One stitched MP4 attached. Tap and hold → Save Video. No clipping needed."
              : "The stitched MP4 was too large to attach — use the download link:"
            : "Stitch failed — individual slide clip links below:",
          ...(compilationLink
            ? [compilationLink]
            : videoSlides.map((s) => forceDownloadUrl(s.videoUrl!, `slide-${s.order + 1}-animated.mp4`))),
        ].join("\n"),
      };
      if (attachIt && attachment) {
        (videoEmail as unknown as Record<string, unknown>).attachments = [
          { filename: attachment.filename, content: attachment.buf.toString("base64") },
        ];
      }
      await resend.emails.send(videoEmail);
      console.log(
        `[carousel-email] Sent carousel video email (${attachment ? (attachIt ? "attached" : "link only") : "links fallback"}, ${videoBuffers.length} source clip(s))`
      );
    } catch (err) {
      console.warn(
        `[carousel-email] Carousel video email failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // ── Update DB ───────────────────────────────────────────────────
  await prisma.carouselPost.update({
    where: { id: carouselPostId },
    data: { emailedAt: new Date(), emailId },
  });

  console.log(
    `[carousel-email] Sent ${carouselPostId} to ${TO_ADDRESS}` +
    ` (${useAttachments ? "attached" : "linked"}, ${(totalBytes / 1024).toFixed(0)}KB, resendId=${emailId})`
  );

  return { emailId };
}

/**
 * Send the finished 30s story video (2026-08-11) — a separate email after
 * the carousel email, with the ready-to-post MP4 attached (≤28MB) or a
 * force-download link when it's too big. The caption from the carousel is
 * included so the post is copy-paste ready.
 */
export async function sendStoryVideoEmail(
  carouselPostId: string,
  videoUrl: string,
  opts: {
    sceneCount: number;
    totalScenes: number;
    narration: string;
    silent: boolean;
  }
): Promise<{ emailId: string }> {
  const { prisma } = await import("@/lib/prisma");
  const post = await prisma.carouselPost.findUniqueOrThrow({
    where: { id: carouselPostId },
    select: { headline: true, caption: true, generatedFor: true },
  });
  const dateStr = post.generatedFor.toISOString().slice(0, 10);
  const filename = `story-${dateStr}.mp4`;
  const downloadUrl = forceDownloadUrl(videoUrl, filename);

  // Attach when it fits under the Resend cap; always include the button.
  let videoBuf: Buffer | null = null;
  try {
    const res = await fetch(videoUrl);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length <= MAX_ATTACHMENT_BYTES) videoBuf = buf;
      else console.log(`[story-email] Video is ${buf.length} bytes — link only`);
    }
  } catch (err) {
    console.warn(`[story-email] Video fetch failed: ${err instanceof Error ? err.message : err}`);
  }

  const partialNote =
    opts.sceneCount < opts.totalScenes
      ? `<p style="font-size:12px;color:#E06C75;">⚠️ ${opts.totalScenes - opts.sceneCount} of ${opts.totalScenes} scenes failed to render — the video is slightly shorter than 30s and the voiceover may run past the last scene.</p>`
      : "";
  const silentNote = opts.silent
    ? `<p style="font-size:12px;color:#E06C75;">⚠️ Voiceover generation failed — this video is silent. The narration script is below if you want to record or caption it yourself.</p>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:500px;margin:0 auto;padding:20px;">
    <h1 style="font-size:20px;color:#FBFAF6;margin:0 0 4px;">🎥 Story video ready to post</h1>
    <p style="font-size:13px;color:#AAA;margin:0 0 16px;">${escapeHtml(post.headline)} · ${escapeHtml(dateStr)}</p>

    ${partialNote}
    ${silentNote}

    <p style="font-size:14px;color:#DDD;line-height:1.6;">
      Fully stitched ~30s vertical video${opts.silent ? "" : " with voiceover"} — ${videoBuf ? "attached below. <strong>Tap and hold → Save Video</strong> to add it to your camera roll." : "download it with the button below."} No clipping needed.
    </p>

    <div style="text-align:center;margin:20px 0;">
      <a href="${escapeHtml(downloadUrl)}" style="display:block;background:#F97E4E;color:#fff;font-weight:600;font-size:15px;padding:14px 20px;border-radius:12px;text-decoration:none;">
        🎬 Download story video (MP4)
      </a>
    </div>

    <div style="background:#1A1A1A;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#666;margin:0 0 8px;font-family:monospace;">Caption (select all to copy)</p>
      <pre style="white-space:pre-wrap;font-size:14px;color:#DDD;font-family:-apple-system,sans-serif;margin:0;line-height:1.5;">${escapeHtml(post.caption)}</pre>
    </div>

    <div style="background:#1A1A1A;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#666;margin:0 0 8px;font-family:monospace;">Voiceover script</p>
      <pre style="white-space:pre-wrap;font-size:13px;color:#BBB;font-family:-apple-system,sans-serif;margin:0;line-height:1.5;">${escapeHtml(opts.narration)}</pre>
    </div>

    <p style="font-size:11px;color:#555;text-align:center;margin-top:20px;">
      Ripple Content Factory · Automated story video delivery
    </p>
  </div>
</body>
</html>`.trim();

  const text = [
    `Story video ready to post — ${post.headline} (${dateStr})`,
    opts.sceneCount < opts.totalScenes
      ? `NOTE: ${opts.totalScenes - opts.sceneCount} scene(s) failed to render — video runs short.`
      : "",
    opts.silent ? "NOTE: voiceover failed — video is silent. Script below." : "",
    "",
    `Download: ${downloadUrl}`,
    "",
    "── Caption ──",
    post.caption,
    "",
    "── Voiceover script ──",
    opts.narration,
  ].filter(Boolean).join("\n");

  const resend = getResendClient();
  const payload: Parameters<typeof resend.emails.send>[0] = {
    from: FROM_ADDRESS,
    to: TO_ADDRESS,
    subject: `[Ripple Content] 🎥 Story video — ${post.headline}`,
    html,
    text,
  };
  if (videoBuf) {
    (payload as unknown as Record<string, unknown>).attachments = [
      { filename, content: videoBuf.toString("base64") },
    ];
  }

  const resp = await resend.emails.send(payload);
  const respAny = resp as Record<string, unknown>;
  const dataObj = (respAny.data ?? respAny) as Record<string, unknown>;
  const emailId = (dataObj.id as string) ?? "";
  console.log(
    `[story-email] Sent story video for ${carouselPostId} to ${TO_ADDRESS} (${videoBuf ? "attached" : "link only"}, resendId=${emailId})`
  );
  return { emailId };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
