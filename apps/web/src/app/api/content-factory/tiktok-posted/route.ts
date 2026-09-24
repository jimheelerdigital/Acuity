/**
 * GET /api/content-factory/tiktok-posted?p=<postId>&a=<ripple|bwk>&s=<sig>
 *
 * Target of the "✓ I posted this on TikTok" button in the manual-TikTok
 * emails (lib/content-factory/posted-link.ts). Marks the post's TikTok
 * SocialPublish row POSTED with the tap time; the nightly TikTok scrape
 * later fills in the video URL and numbers. Idempotent — a second tap
 * keeps the first posted time.
 */

import { NextRequest, NextResponse } from "next/server";

import { verifyTiktokPosted } from "@/lib/content-factory/posted-link";

export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#111;color:#FBFAF6;font-family:-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px;">
<div><p style="font-size:44px;margin:0;">${status === 200 ? "✓" : "⚠️"}</p><p style="font-size:18px;font-weight:700;">${title}</p><p style="font-size:14px;color:#999;max-width:320px;">${body}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") ?? "";
  const a = req.nextUrl.searchParams.get("a") ?? "";
  const s = req.nextUrl.searchParams.get("s") ?? "";
  if ((a !== "ripple" && a !== "bwk") || !verifyTiktokPosted(p, a, s)) {
    return page("Link not valid", "This posted-link couldn't be verified.", 400);
  }

  const { prisma } = await import("@/lib/prisma");
  const post = await prisma.carouselPost.findUnique({ where: { id: p }, select: { headline: true } });
  if (!post) return page("Post not found", "It may have been deleted.", 404);

  const now = new Date();
  const existing = await prisma.socialPublish.findUnique({
    where: { carouselPostId_platform_accountKey: { carouselPostId: p, platform: "tiktok", accountKey: a } },
    select: { status: true },
  });
  if (existing?.status !== "POSTED") {
    await prisma.socialPublish.upsert({
      where: { carouselPostId_platform_accountKey: { carouselPostId: p, platform: "tiktok", accountKey: a } },
      create: { carouselPostId: p, platform: "tiktok", accountKey: a, status: "POSTED", scheduledAt: now, postedAt: now },
      update: { status: "POSTED", postedAt: now, error: null },
    });
  }

  return page("Marked as posted", `“${post.headline}” — numbers will show on the metrics dashboard after tonight's refresh.`);
}
