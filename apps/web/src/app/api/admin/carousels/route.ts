import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// The resend-email action downloads every slide video and stitches them
// into one compilation MP4 (2026-08-12) before emailing — well past the
// default API-route timeout. 300s matches the Inngest route ceiling.
export const maxDuration = 300;

/**
 * GET /api/admin/carousels — list carousel posts with slides.
 * Query params: status (optional), date (optional YYYY-MM-DD).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const date = url.searchParams.get("date");
  const cursor = url.searchParams.get("cursor"); // cursor-based pagination
  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 100);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (date) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const next = new Date(d.getTime() + 86_400_000);
    where.generatedFor = { gte: d, lt: next };
  }

  const posts = await prisma.carouselPost.findMany({
    where,
    include: { slides: { orderBy: { order: "asc" } } },
    orderBy: { generatedFor: "desc" },
    take: limit + 1, // fetch one extra to detect if there's a next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = posts.length > limit;
  if (hasMore) posts.pop();
  const nextCursor = hasMore ? posts[posts.length - 1]?.id : null;

  // Daily summary: stats for today's generation run
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const todayPosts = await prisma.carouselPost.findMany({
    where: { generatedFor: { gte: today, lt: tomorrow } },
    select: { status: true, slides: { select: { kind: true } } },
  });

  const summary = {
    date: today.toISOString().slice(0, 10),
    drafts: todayPosts.filter((p) => p.status === "DRAFT").length,
    approved: todayPosts.filter((p) => p.status === "APPROVED").length,
    rejected: todayPosts.filter((p) => p.status === "REJECTED").length,
    posted: todayPosts.filter((p) => p.status === "POSTED").length,
    total: todayPosts.length,
    // Each image slide costs ~$0.08; legacy CTA slides were composed, not generated
    estimatedCostCents: todayPosts.reduce(
      (acc, p) => acc + p.slides.filter((s) => s.kind !== "CTA").length * 8,
      0
    ),
  };

  // Aggregate stats across all posts (for library header)
  const [totalCount, draftCount, approvedCount, rejectedCount, postedCount] =
    await Promise.all([
      prisma.carouselPost.count(),
      prisma.carouselPost.count({ where: { status: "DRAFT" } }),
      prisma.carouselPost.count({ where: { status: "APPROVED" } }),
      prisma.carouselPost.count({ where: { status: "REJECTED" } }),
      prisma.carouselPost.count({ where: { status: "POSTED" } }),
    ]);

  return NextResponse.json({
    posts,
    summary,
    nextCursor,
    totals: {
      all: totalCount,
      draft: draftCount,
      approved: approvedCount,
      rejected: rejectedCount,
      posted: postedCount,
    },
  });
}

/**
 * POST /api/admin/carousels — actions: approve, reject, regenerate-slide, generate-topic.
 */
export async function POST(req: NextRequest) {
  // CRON_SECRET bearer auth (for scripted/ops triggers) or admin session.
  const authHeader = req.headers.get("authorization");
  const cronAuthed =
    !!process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronAuthed) {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const poster = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAdmin: true },
    });
    if (!poster?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json();
  const { action, postId, slideId, topicSlug, newText } = body as {
    action: string;
    postId?: string;
    slideId?: string;
    topicSlug?: string;
    newText?: string;
  };

  switch (action) {
    case "approve": {
      if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
      await prisma.carouselPost.update({
        where: { id: postId },
        data: { status: "APPROVED" },
      });
      return NextResponse.json({ ok: true });
    }

    case "reject": {
      if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
      await prisma.carouselPost.update({
        where: { id: postId },
        data: { status: "REJECTED" },
      });
      return NextResponse.json({ ok: true });
    }

    case "regenerate-slide": {
      if (!slideId) return NextResponse.json({ error: "slideId required" }, { status: 400 });
      const { regenerateSlide } = await import("@/lib/content-factory/carousel-generate");
      const newUrl = await regenerateSlide(slideId);
      return NextResponse.json({ ok: true, imageUrl: newUrl });
    }

    case "mark-posted": {
      if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
      await prisma.carouselPost.update({
        where: { id: postId },
        data: { status: "POSTED" },
      });
      return NextResponse.json({ ok: true });
    }

    case "edit-text": {
      if (!slideId || !newText) return NextResponse.json({ error: "slideId and newText required" }, { status: 400 });
      const { recomposeSlide } = await import("@/lib/content-factory/carousel-generate");
      const newUrl = await recomposeSlide(slideId, newText);
      return NextResponse.json({ ok: true, imageUrl: newUrl, overlayText: newText });
    }

    case "animate-cover": {
      if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
      // Clear any existing video first so the Inngest function's
      // "already animated" guard doesn't skip a manual re-animate.
      await prisma.carouselSlide.updateMany({
        where: { carouselPostId: postId, kind: "COVER" },
        data: { videoUrl: null },
      });
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "content-factory/cover.animate",
        data: { postId },
      });
      return NextResponse.json({ ok: true, queued: true });
    }

    case "animate-all": {
      // Full animated-post treatment: animate every slide except the CTA
      // and send the email after renders finish. Same path as the daily
      // 12 UTC run — used for manual tests and re-runs.
      if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "content-factory/cover.animate",
        data: {
          postId,
          // sendEmail: false allows silent prompt-validation runs.
          sendEmail: (body as { sendEmail?: boolean }).sendEmail !== false,
          animateAll: true,
          animationStyle: "smooth",
        },
      });
      return NextResponse.json({ ok: true, queued: true });
    }

    case "generate-daily": {
      // Kick off a full daily-style generation on demand (fresh topic,
      // fresh images). `animated: true` runs the text-free animated
      // pipeline; false/omitted follows the cron-hour default.
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "content-factory/daily.generate",
        data: {
          animated: (body as { animated?: boolean }).animated,
        },
      });
      return NextResponse.json({ ok: true, queued: true });
    }

    case "generate-story": {
      // Queue the 30s story video for an existing post (script → scene
      // images → clips → duration-fitted voiceover → stitched MP4 →
      // "🎥 Story video" email). Same Inngest function as the daily run.
      if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "content-factory/story.video",
        data: { postId },
      });
      return NextResponse.json({ ok: true, queued: true });
    }

    case "resend-email": {
      if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
      const { sendCarouselEmail } = await import("@/lib/content-factory/email");
      const { emailId } = await sendCarouselEmail(postId, true); // force=true bypasses emailedAt guard
      return NextResponse.json({ ok: true, emailId });
    }

    case "generate-topic": {
      if (!topicSlug) return NextResponse.json({ error: "topicSlug required" }, { status: 400 });
      const { generateCarousel } = await import("@/lib/content-factory/carousel-generate");
      const result = await generateCarousel(topicSlug);
      return NextResponse.json({ ok: true, ...result });
    }

    case "generate-one-off": {
      // Fire-and-forget via Inngest — picks a random unused topic,
      // generates the carousel, and emails the result.
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "carousel/generate.one-off",
        data: topicSlug ? { topicSlug } : {},
      });
      return NextResponse.json({ ok: true, queued: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
