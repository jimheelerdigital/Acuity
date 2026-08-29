/**
 * Content Factory — carousel email delivery via Resend.
 *
 * Animated carousels (any slide has a videoUrl): exactly ONE email with
 * the fully stitched ready-to-post MP4 + the caption, nothing else
 * (2026-08-25, per Keenan). Static carousels: one email with the slide
 * images attached (or linked if oversized) and the caption.
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

  // ── Animated slide videos (fully animated posts have several) ───
  const videoSlides = post.slides.filter((s) => s.videoUrl);

  // Animated carousel → ONE email: the fully stitched ready-to-post MP4
  // plus the caption, nothing else (2026-08-25, per Keenan: "stop sending
  // two separate carousel videos. only send the fully clipped animated
  // carousel video plus the captions only"). The old main email with
  // slide images + per-slide clip buttons is gone for animated posts.
  const videoBuffers: { filename: string; buf: Buffer; order: number }[] = [];
  for (const slide of videoSlides) {
    try {
      const res = await fetch(slide.videoUrl!);
      console.log(`[carousel-email] Video fetch (slide ${slide.order}): status=${res.status}, size=${res.headers.get("content-length") ?? "unknown"}`);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const num = String(slide.order + 1).padStart(2, "0");
        videoBuffers.push({ filename: `${num}-${slide.kind.toLowerCase()}-animated.mp4`, buf, order: slide.order });
      }
    } catch (err) {
      console.warn(`[carousel-email] Failed to fetch video for slide ${slide.order}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (videoBuffers.length > 0) {
    return sendStitchedVideoEmail(post, dateStr, videoSlides, videoBuffers);
  }

  // ── Static carousel (no videos) — image email ───────────────────
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

  // ── Build HTML ──────────────────────────────────────────────────
  const slideList = post.slides
    .map((s, i) => `<li style="margin-bottom:4px;color:#999;">${i + 1}. ${escapeHtml(s.overlayText)}</li>`)
    .join("\n");

  const coverUrl = post.slides[0]?.imageUrl ?? "";
  const reviewUrl = `${REVIEW_BASE_URL}/admin/content-factory/carousels`;

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
    <h1 style="font-size:20px;color:#FBFAF6;margin:0 0 4px;">${escapeHtml(post.headline)}</h1>
    <p style="font-size:12px;color:#888;margin:0 0 16px;">
      ${escapeHtml(lane)} · ${escapeHtml(dateStr)} · ${post.slides.length} slides
    </p>

    <!-- Caption FIRST (2026-08-20, per Keenan): Gmail's mobile app clips
         long messages ("[Message clipped]") and the caption at the bottom
         was getting cut off — the caption is the one thing that must
         always be visible and copyable. -->
    <div style="background:#1A1A1A;border-radius:12px;padding:16px;margin:0 0 16px;">
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#666;margin:0 0 8px;font-family:monospace;">Caption (select all to copy)</p>
      <pre style="white-space:pre-wrap;font-size:14px;color:#DDD;font-family:-apple-system,sans-serif;margin:0;line-height:1.5;">${escapeHtml(post.caption)}</pre>
    </div>

    ${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="Cover" style="width:100%;border-radius:12px;margin-bottom:16px;" />` : ""}

    ${attachNote}

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
    (emailPayload as unknown as Record<string, unknown>).attachments = slideBuffers.map((s) => ({
      filename: s.filename,
      content: s.buf.toString("base64"),
    }));
  }

  const resp = await resend.emails.send(emailPayload);

  // Resend client shape varies — extract ID safely
  const respAny = resp as Record<string, unknown>;
  const dataObj = (respAny.data ?? respAny) as Record<string, unknown>;
  const emailId = (dataObj.id as string) ?? "";

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
 * Animated carousel delivery (2026-08-25, per Keenan): exactly ONE email —
 * the fully stitched, ready-to-post MP4 plus the caption. No slide images,
 * no per-slide clip buttons, no follow-up email.
 *
 * The compilation contains EVERY non-CTA slide in order (2026-08-13:
 * the slideshow must go through ALL the reasons). Slides whose animation
 * failed every retry wave are included as 4s still clips of their static
 * JPEG instead of being skipped. Crossfade blending between slides
 * (2026-08-16), falling back to 0.4s fade-to-black cuts (2026-08-15).
 */
async function sendStitchedVideoEmail(
  post: PostRow,
  dateStr: string,
  videoSlides: SlideRow[],
  videoBuffers: { filename: string; buf: Buffer; order: number }[]
): Promise<{ emailId: string }> {
  const { prisma } = await import("@/lib/prisma");

  let attachment: { filename: string; buf: Buffer } | null = null;
  let compilationUrl: string | null = null;
  try {
    if (videoBuffers.length === 1 && post.slides.length <= 1) {
      // Single-slide post — nothing to assemble.
      attachment = videoBuffers[0];
      compilationUrl = videoSlides[0]?.videoUrl ?? null;
    } else {
      const { stitchStoryVideo, stillImageClip, stitchClipsWithCrossfade } =
        await import("./story-video");
      const segments: Buffer[] = [];
      for (const slide of post.slides) {
        if (slide.kind === "CTA") continue;
        const animated = videoBuffers.find((v) => v.order === slide.order);
        if (animated) {
          segments.push(animated.buf);
          continue;
        }
        try {
          const res = await fetch(slide.imageUrl);
          if (!res.ok) throw new Error(`image fetch failed (${res.status})`);
          const still = await stillImageClip(
            Buffer.from(await res.arrayBuffer()),
            4
          );
          segments.push(still);
          console.log(
            `[carousel-email] Slide ${slide.order} has no animation — using a 4s still clip`
          );
        } catch (stillErr) {
          console.error(
            `[carousel-email] Still clip failed for slide ${slide.order} — compilation will skip it: ${stillErr instanceof Error ? stillErr.message : stillErr}`
          );
        }
      }
      let stitched: Buffer;
      try {
        stitched = await stitchClipsWithCrossfade(segments);
      } catch (xfadeErr) {
        console.error(
          `[carousel-email] Crossfade stitch failed — falling back to fade-out cuts: ${xfadeErr instanceof Error ? xfadeErr.message : xfadeErr}`
        );
        stitched = await stitchStoryVideo(segments, { fadeOutSec: 0.4 });
      }
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

  const attachIt =
    attachment !== null && attachment.buf.length <= MAX_ATTACHMENT_BYTES;
  const compilationLink = compilationUrl
    ? forceDownloadUrl(compilationUrl, `carousel-${dateStr}.mp4`)
    : null;
  // Only if the stitch itself failed do we fall back to per-slide links —
  // otherwise it's strictly the one finished video.
  const linkList = compilationLink
    ? `<a href="${escapeHtml(compilationLink)}" style="display:block;background:#F97E4E;color:#fff;font-weight:600;font-size:15px;padding:14px 20px;border-radius:12px;text-decoration:none;">🎬 Download carousel video (MP4)</a>`
    : videoSlides
        .map((s) => `<p style="font-size:13px;"><a href="${escapeHtml(forceDownloadUrl(s.videoUrl!, `slide-${s.order + 1}-animated.mp4`))}" style="color:#F97E4E;">Download slide ${s.order + 1} animation</a></p>`)
        .join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:500px;margin:0 auto;padding:20px;">
    <h1 style="font-size:18px;color:#FBFAF6;margin:0 0 8px;">🎬 ${escapeHtml(post.headline)}</h1>
    <p style="font-size:12px;color:#888;margin:0 0 16px;">${escapeHtml(post.topicSlug)} · ${escapeHtml(dateStr)}</p>
    <!-- Caption FIRST (2026-08-20): Gmail mobile clips long messages. -->
    <div style="background:#1A1A1A;border-radius:12px;padding:16px;margin:0 0 16px;">
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#666;margin:0 0 8px;font-family:monospace;">Caption (select all to copy)</p>
      <pre style="white-space:pre-wrap;font-size:14px;color:#DDD;font-family:-apple-system,sans-serif;margin:0;line-height:1.5;">${escapeHtml(post.caption)}</pre>
    </div>
    <p style="font-size:14px;color:#DDD;line-height:1.6;margin:0 0 16px;">
      ${
        attachment
          ? `The finished carousel video${attachIt ? " is attached below" : ""}.<br/><strong>${attachIt ? "Tap and hold the video → Save Video" : "Use the download button below"}</strong> — no clipping needed.`
          : `The stitched video couldn't be built this time — download the individual slide clips below.`
      }
    </p>
    <div style="text-align:center;margin:16px 0;">${linkList}</div>
    <p style="font-size:11px;color:#555;text-align:center;margin-top:20px;">
      Ripple Content Factory · Automated carousel delivery
    </p>
  </div>
</body>
</html>`.trim();

  const text = [
    `Carousel video — ${post.headline}`,
    "",
    "── Caption ──",
    post.caption,
    "",
    attachment
      ? attachIt
        ? "One stitched MP4 attached. Tap and hold → Save Video. No clipping needed."
        : "The stitched MP4 was too large to attach — use the download link:"
      : "Stitch failed — individual slide clip links below:",
    ...(compilationLink
      ? [compilationLink]
      : videoSlides.map((s) => forceDownloadUrl(s.videoUrl!, `slide-${s.order + 1}-animated.mp4`))),
  ].join("\n");

  const resend = getResendClient();
  const emailPayload: Parameters<typeof resend.emails.send>[0] = {
    from: FROM_ADDRESS,
    to: TO_ADDRESS,
    subject: `[Ripple Content] 🎬 Carousel video — ${post.headline}`,
    html,
    text,
  };
  if (attachIt && attachment) {
    (emailPayload as unknown as Record<string, unknown>).attachments = [
      { filename: attachment.filename, content: attachment.buf.toString("base64") },
    ];
  }

  const resp = await resend.emails.send(emailPayload);
  const respAny = resp as Record<string, unknown>;
  const dataObj = (respAny.data ?? respAny) as Record<string, unknown>;
  const emailId = (dataObj.id as string) ?? "";

  await prisma.carouselPost.update({
    where: { id: post.id },
    data: { emailedAt: new Date(), emailId },
  });

  console.log(
    `[carousel-email] Sent single stitched-video email for ${post.id} to ${TO_ADDRESS} (${attachment ? (attachIt ? "attached" : "link only") : "links fallback"}, ${videoBuffers.length} source clip(s), resendId=${emailId})`
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
    /**
     * Whether captions actually made it onto the video (2026-08-14).
     * The 8-13/8-14 silent emails claimed the script was "burned in as
     * captions" when the mux had failed and the raw stitch shipped —
     * never claim captions unless the captioned mux succeeded.
     */
    captioned?: boolean;
    /** Measured length of the assembled video — the recording target. */
    durationSec?: number;
    /** Why TTS or the mux failed (shown so the cause is never a mystery). */
    voiceoverError?: string | null;
    /**
     * Which TTS engine voiced the video, e.g. "elevenlabs:<voiceId>" or
     * "openai:gpt-4o-mini-tts/sage" (2026-08-16, per Keenan: the voice
     * kept sounding bad and we couldn't tell WHICH engine he was hearing).
     */
    voiceEngine?: string | null;
    /**
     * Captions are deliberately left off (2026-08-18, ambient videos:
     * Keenan captions them manually when posting) — say so instead of
     * the "captions failed" wording.
     */
    captionsByHand?: boolean;
    /**
     * AMBIENT calm video (2026-08-19, per Keenan: "i never received the
     * content video" ×3 — the emails WERE in his inbox but wore the same
     * "🎥 Story video" subject as the daily story emails, so they were
     * invisible). Calm videos get their own 🌙 subject and heading.
     */
    calm?: boolean;
    /**
     * The video is silent BY DESIGN (2026-08-24, per Keenan: he records
     * calm voiceovers himself now). Leads with the script framed as
     * "record this" — no ⚠️ failure framing, no scary subject.
     */
    selfVoice?: boolean;
    /**
     * Quote-loop video (2026-08-28 PM, per Keenan): silent BY DESIGN
     * with the quote burned in — no voiceover-script framing at all.
     * Gets its own 🖤 subject; `narration` carries the quote line.
     */
    quote?: boolean;
  }
): Promise<{ emailId: string }> {
  const { prisma } = await import("@/lib/prisma");
  const post = await prisma.carouselPost.findUniqueOrThrow({
    where: { id: carouselPostId },
    select: { headline: true, caption: true, generatedFor: true },
  });
  const dateStr = post.generatedFor.toISOString().slice(0, 10);
  const kind = opts.quote ? "quote loop" : opts.calm ? "calm video" : "story video";
  const emoji = opts.quote ? "🖤" : opts.calm ? "🌙" : "🎥";
  const label = opts.quote ? "Quote loop" : opts.calm ? "Calm video" : "Story video";
  const filename = `${opts.quote ? "quote" : opts.calm ? "calm" : "story"}-${dateStr}.mp4`;
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
      ? `<p style="font-size:12px;color:#E06C75;">⚠️ ${opts.totalScenes - opts.sceneCount} of ${opts.totalScenes} scenes failed to render — the video runs shorter than 30s, but each remaining scene keeps its own narration line so nothing is out of sync.</p>`
      : "";
  // When the voiceover failed, the email LEADS with the record-it-yourself
  // block (2026-08-13, per Keenan): the exact script, the target length,
  // and a note that matching captions are already burned into the video —
  // so the video + script stay cohesive and he can record over it.
  const durationLabel = opts.durationSec
    ? `${Math.round(opts.durationSec)} seconds`
    : "~30 seconds";
  const captioned = opts.captioned ?? false;
  // Silent BY DESIGN (2026-08-24): the script IS the deliverable — Keenan
  // records the voiceover himself. Lead with it, no failure framing.
  const selfVoiceNote = opts.selfVoice
    ? `
    <div style="background:#12201A;border:1px solid #4EAE7E;border-radius:12px;padding:16px;margin:0 0 16px;">
      <p style="font-size:13px;font-weight:600;color:#4EAE7E;margin:0 0 8px;">🎙️ Your voiceover script</p>
      <p style="font-size:12px;color:#DDD;margin:0 0 10px;line-height:1.5;">The video is silent on purpose — record this script in your own voice and add it as the audio when you post. The video runs <strong>${durationLabel}</strong>; read slowly and let the pauses breathe. No captions are burned in — add them when you post.</p>
      <pre style="white-space:pre-wrap;font-size:15px;color:#FBFAF6;font-family:-apple-system,sans-serif;margin:0;line-height:1.7;background:#1A1A1A;border-radius:8px;padding:12px;">${escapeHtml(opts.narration)}</pre>
    </div>`
    : "";
  // Quote loop (2026-08-28 PM): silent by design, quote burned in — no
  // script framing anywhere. One calm explainer block instead.
  const quoteNote = opts.quote
    ? `
    <div style="background:#16161A;border:1px solid #555;border-radius:12px;padding:16px;margin:0 0 16px;">
      <p style="font-size:13px;font-weight:600;color:#DDD;margin:0 0 8px;">🖤 Seamless quote loop</p>
      <p style="font-size:12px;color:#DDD;margin:0 0 10px;line-height:1.5;">The quote is burned in and the video loops with no visible start or end (runs <strong>${durationLabel}</strong>). It's silent on purpose — pair it with a trending calm/ambient sound when you post.</p>
      <pre style="white-space:pre-wrap;font-size:15px;color:#FBFAF6;font-family:-apple-system,sans-serif;margin:0;line-height:1.7;background:#1A1A1A;border-radius:8px;padding:12px;">${escapeHtml(opts.narration)}</pre>
    </div>`
    : "";
  const silentNote = opts.silent && !opts.selfVoice && !opts.quote
    ? `
    <div style="background:#2A1A12;border:1px solid #F97E4E;border-radius:12px;padding:16px;margin:0 0 16px;">
      <p style="font-size:13px;font-weight:600;color:#F97E4E;margin:0 0 8px;">🎙️ Voiceover failed — record this yourself</p>
      <p style="font-size:12px;color:#DDD;margin:0 0 10px;line-height:1.5;">${captioned ? `The video has NO audio, but the script below is already burned in as on-screen captions, timed to the video. Record the script in a voice memo (aim for <strong>${durationLabel}</strong> — the captions pace you), then add it as the audio when you post.` : `The video has NO audio and NO captions — it's the raw visual only. Record the script below in a voice memo (aim for <strong>${durationLabel}</strong>), then add it as the audio when you post.`}</p>
      <pre style="white-space:pre-wrap;font-size:14px;color:#FBFAF6;font-family:-apple-system,sans-serif;margin:0;line-height:1.6;background:#1A1A1A;border-radius:8px;padding:12px;">${escapeHtml(opts.narration)}</pre>
      ${opts.voiceoverError ? `<p style="font-size:10px;color:#888;margin:10px 0 0;font-family:monospace;">Failure reason: ${escapeHtml(opts.voiceoverError.slice(0, 200))}</p>` : ""}
    </div>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:500px;margin:0 auto;padding:20px;">
    <h1 style="font-size:20px;color:#FBFAF6;margin:0 0 4px;">${emoji} ${label} ready to post</h1>
    <p style="font-size:13px;color:#AAA;margin:0 0 16px;">${escapeHtml(post.headline)} · ${escapeHtml(dateStr)}</p>

    ${partialNote}
    ${quoteNote}
    ${selfVoiceNote}
    ${silentNote}

    <!-- Caption FIRST (2026-08-20): Gmail mobile clips long messages. -->
    <div style="background:#1A1A1A;border-radius:12px;padding:16px;margin:0 0 16px;">
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#666;margin:0 0 8px;font-family:monospace;">Caption (select all to copy)</p>
      <pre style="white-space:pre-wrap;font-size:14px;color:#DDD;font-family:-apple-system,sans-serif;margin:0;line-height:1.5;">${escapeHtml(post.caption)}</pre>
    </div>

    <p style="font-size:14px;color:#DDD;line-height:1.6;">
      ${opts.quote ? "Seamlessly looping quote video (silent — add audio when you post)" : opts.calm ? "Looping calm video" : "Fully stitched ~30s vertical video"}${opts.quote ? "" : opts.selfVoice ? " — clean visual, ready for your voiceover" : opts.silent ? (captioned ? " with the script burned in as captions (no audio)" : " (no audio, no captions)") : captioned ? " with voiceover and burned-in captions" : opts.captionsByHand ? " with voiceover — no captions burned in, add them when you post" : " with voiceover (captions failed — audio only)"} — ${videoBuf ? "attached below. <strong>Tap and hold → Save Video</strong> to add it to your camera roll." : "download it with the button below."} No clipping needed.
    </p>

    <div style="text-align:center;margin:20px 0;">
      <a href="${escapeHtml(downloadUrl)}" style="display:block;background:#F97E4E;color:#fff;font-weight:600;font-size:15px;padding:14px 20px;border-radius:12px;text-decoration:none;">
        ${emoji} Download ${kind} (MP4)
      </a>
    </div>

    ${opts.silent || opts.quote ? "" : `<div style="background:#1A1A1A;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#666;margin:0 0 8px;font-family:monospace;">Voiceover script${opts.voiceEngine ? ` · voiced by ${escapeHtml(opts.voiceEngine)}` : ""}</p>
      <pre style="white-space:pre-wrap;font-size:13px;color:#BBB;font-family:-apple-system,sans-serif;margin:0;line-height:1.5;">${escapeHtml(opts.narration)}</pre>
    </div>`}

    <p style="font-size:11px;color:#555;text-align:center;margin-top:20px;">
      Ripple Content Factory · Automated story video delivery
    </p>
  </div>
</body>
</html>`.trim();

  const text = [
    `${label} ready to post — ${post.headline} (${dateStr})`,
    "",
    "── Caption ──",
    post.caption,
    "",
    opts.sceneCount < opts.totalScenes
      ? `NOTE: ${opts.totalScenes - opts.sceneCount} scene(s) failed to render — video runs short; each remaining scene keeps its own narration line.`
      : "",
    opts.quote
      ? `Seamless quote loop (runs ${durationLabel}, no visible start or end). Silent on purpose — pair it with a trending calm sound when you post.`
      : opts.selfVoice
        ? `The video is silent on purpose — record the script below in your own voice (it runs ${durationLabel}) and add it as the audio when you post. No captions burned in.`
        : opts.silent
          ? `NOTE: voiceover failed — the video has NO audio${captioned ? ", but the script is burned in as captions" : " and NO captions"}. Record the script below (aim for ${durationLabel}) and add it as audio when you post.${opts.voiceoverError ? ` Failure reason: ${opts.voiceoverError.slice(0, 200)}` : ""}`
          : "",
    "",
    `Download: ${downloadUrl}`,
    "",
    opts.quote ? "── THE QUOTE ──" : opts.selfVoice ? "── YOUR VOICEOVER SCRIPT ──" : opts.silent ? "── RECORD THIS SCRIPT ──" : "── Voiceover script ──",
    opts.narration,
  ].filter(Boolean).join("\n");

  const resend = getResendClient();
  const payload: Parameters<typeof resend.emails.send>[0] = {
    from: FROM_ADDRESS,
    to: TO_ADDRESS,
    // A silent-by-accident story is a broken deliverable — say so in the
    // subject so it can't be posted by accident (2026-08-16). Silent
    // BY DESIGN (selfVoice) gets a calm 🎙️ subject instead.
    subject: opts.selfVoice
      ? `[Ripple Content] ${emoji}🎙️ ${label} + your script — ${post.headline}`
      : opts.silent
        ? `[Ripple Content] ⚠️ SILENT ${kind} — RECORD VOICEOVER — ${post.headline}`
        : `[Ripple Content] ${emoji} ${label} — ${post.headline}`,
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
