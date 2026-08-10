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

  // Attach each video that still fits within the attachment budget;
  // every video always gets a download link regardless.
  const videoBuffers: { filename: string; buf: Buffer }[] = [];
  for (const slide of videoSlides) {
    try {
      const res = await fetch(slide.videoUrl!);
      console.log(`[carousel-email] Video fetch (slide ${slide.order}): status=${res.status}, size=${res.headers.get("content-length") ?? "unknown"}`);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (totalBytes + buf.length <= MAX_ATTACHMENT_BYTES) {
          const num = String(slide.order + 1).padStart(2, "0");
          videoBuffers.push({ filename: `${num}-${slide.kind.toLowerCase()}-animated.mp4`, buf });
          totalBytes += buf.length;
        } else {
          console.log(`[carousel-email] Video for slide ${slide.order} too large to attach: ${buf.length} bytes, budget remaining: ${MAX_ATTACHMENT_BYTES - totalBytes}`);
        }
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
      <a href="${escapeHtml(s.videoUrl!)}" download="slide-${s.order + 1}-animated.mp4" style="display:block;background:#F97E4E;color:#fff;font-weight:600;font-size:15px;padding:14px 20px;border-radius:12px;text-decoration:none;margin-bottom:8px;">
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
        On your phone: tap a button to open the video, then Share&nbsp;→&nbsp;Save&nbsp;Video to add it to your camera roll.${videoBuffers.length > 0 ? ` (${videoBuffers.length} of ${videoSlides.length} also attached.)` : ""}
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
            `${s.kind === "COVER" ? "Cover" : `Slide ${s.order + 1}`}: ${s.videoUrl}`
          ),
          "On your phone: open a link, then Share → Save Video.",
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
    const attachments = slideBuffers.map((s) => ({
      filename: s.filename,
      content: s.buf.toString("base64"),
    }));
    for (const v of videoBuffers) {
      attachments.push({
        filename: v.filename,
        content: v.buf.toString("base64"),
      });
    }
    (emailPayload as Record<string, unknown>).attachments = attachments;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
