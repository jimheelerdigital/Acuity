import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Daily summary: stats for today's generation run
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const todayPosts = await prisma.carouselPost.findMany({
    where: { generatedFor: { gte: today, lt: tomorrow } },
    select: { status: true, slides: { select: { id: true } } },
  });

  const summary = {
    date: today.toISOString().slice(0, 10),
    drafts: todayPosts.filter((p) => p.status === "DRAFT").length,
    approved: todayPosts.filter((p) => p.status === "APPROVED").length,
    rejected: todayPosts.filter((p) => p.status === "REJECTED").length,
    posted: todayPosts.filter((p) => p.status === "POSTED").length,
    total: todayPosts.length,
    // Each image slide (non-CTA) costs ~$0.08
    estimatedCostCents: todayPosts.reduce(
      (acc, p) => acc + (p.slides.length > 0 ? (p.slides.length - 1) * 8 : 0),
      0
    ),
  };

  return NextResponse.json({ posts, summary });
}

/**
 * POST /api/admin/carousels — actions: approve, reject, regenerate-slide, generate-topic.
 */
export async function POST(req: NextRequest) {
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

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
