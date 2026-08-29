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
 * Query params: format (optional PHOTO|VIDEO|STORY|AMBIENT), date
 * (optional YYYY-MM-DD).
 *
 * 2026-08-18 revamp (per Keenan): the approval workflow is gone from the
 * UI — filtering/sorting is by FORMAT, "posted" is derived from pasted
 * platform links, and every cost figure includes Higgsfield clip renders.
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
  const format = url.searchParams.get("format");
  const date = url.searchParams.get("date");
  const cursor = url.searchParams.get("cursor"); // cursor-based pagination
  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 100);

  const where: Record<string, unknown> = {};
  if (format && ["PHOTO", "VIDEO", "STORY", "AMBIENT"].includes(format)) {
    where.format = format;
  }
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

  const { estimatePostCostCents } = await import("@/lib/content-factory/costs");
  const postsWithCost = posts.map((p) => ({
    ...p,
    estCostCents: estimatePostCostCents(p),
  }));

  // Spend summaries: today's generation run + running month total.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const [todayPosts, monthPosts] = await Promise.all([
    prisma.carouselPost.findMany({
      where: { generatedFor: { gte: today, lt: tomorrow } },
      select: { format: true, slides: { select: { kind: true } } },
    }),
    prisma.carouselPost.findMany({
      where: { generatedFor: { gte: monthStart } },
      select: { format: true, slides: { select: { kind: true } } },
    }),
  ]);

  const summary = {
    date: today.toISOString().slice(0, 10),
    total: todayPosts.length,
    estimatedCostCents: todayPosts.reduce(
      (acc, p) => acc + estimatePostCostCents(p),
      0
    ),
    monthCostCents: monthPosts.reduce(
      (acc, p) => acc + estimatePostCostCents(p),
      0
    ),
  };

  // Format totals for the library filter pills. "posted" = has a pasted
  // platform link (the old POSTED status is UI-retired).
  const [totalCount, photoCount, videoCount, storyCount, ambientCount, postedCount] =
    await Promise.all([
      prisma.carouselPost.count(),
      prisma.carouselPost.count({ where: { format: "PHOTO" } }),
      prisma.carouselPost.count({ where: { format: "VIDEO" } }),
      prisma.carouselPost.count({ where: { format: "STORY" } }),
      prisma.carouselPost.count({ where: { format: "AMBIENT" } }),
      prisma.carouselPost.count({
        where: {
          OR: [{ instagramUrl: { not: null } }, { tiktokUrl: { not: null } }],
        },
      }),
    ]);

  return NextResponse.json({
    posts: postsWithCost,
    summary,
    nextCursor,
    totals: {
      all: totalCount,
      photo: photoCount,
      video: videoCount,
      story: storyCount,
      ambient: ambientCount,
      posted: postedCount,
    },
  });
}

/**
 * POST /api/admin/carousels — actions: regenerate-slide, edit-text,
 * animate-cover, animate-all, generate-daily,
 * save-metrics, save-links, refresh-metrics, resend-email,
 * generate-topic, generate-one-off.
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
    // NOTE (2026-08-18, per Keenan): the approve / reject / mark-posted
    // actions are retired — the approval workflow is gone from the UI.
    // The status column stays in the DB untouched; "posted" is now
    // derived from pasted platform links (save-links).
    case "regenerate-slide": {
      if (!slideId) return NextResponse.json({ error: "slideId required" }, { status: 400 });
      const { regenerateSlide } = await import("@/lib/content-factory/carousel-generate");
      const newUrl = await regenerateSlide(slideId);
      return NextResponse.json({ ok: true, imageUrl: newUrl });
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
      // Kick off a daily-bucket generation on demand (fresh topic, fresh
      // images). `bucket`: "rules" | "missed" | "ambient" | "forbidden" |
      // "moody-women" | "moody-men" | "memento" | "questions" |
      // "bloomers" | "taught" | "sign" | "year" | "free" | "behind" |
      // "nobody" | "unsent" (anything else falls back to "rules" — the
      // video/positive/selfie/quote-loop lanes are dead, 2026-08-28).
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "content-factory/daily.generate",
        data: {
          bucket: (body as { bucket?: string }).bucket,
        },
      });
      return NextResponse.json({ ok: true, queued: true });
    }

    case "save-metrics": {
      // Manual engagement entry (Keenan, from the platform's analytics).
      // Feeds the topic-generation feedback loop — top/bottom performers
      // are passed into the next daily topic prompt.
      if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
      const metrics = (body as { metrics?: Record<string, unknown> }).metrics ?? {};
      const parseMetric = (v: unknown): number | null => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
      };
      await prisma.carouselPost.update({
        where: { id: postId },
        data: {
          views: parseMetric(metrics.views),
          likes: parseMetric(metrics.likes),
          comments: parseMetric(metrics.comments),
          saves: parseMetric(metrics.saves),
          shares: parseMetric(metrics.shares),
          metricsAt: new Date(),
        },
      });
      return NextResponse.json({ ok: true });
    }

    case "save-links": {
      // Paste-once platform links — the metrics-refresh cron pulls
      // engagement automatically for any post with a link, and having a
      // link is what marks a post as "posted" in the UI (2026-08-18).
      if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
      const links = (body as { links?: { instagramUrl?: unknown; tiktokUrl?: unknown } }).links ?? {};
      const parseLink = (v: unknown): string | null => {
        if (typeof v !== "string" || v.trim() === "") return null;
        const url = v.trim();
        if (!/^https?:\/\//i.test(url)) return null;
        return url;
      };
      await prisma.carouselPost.update({
        where: { id: postId },
        data: {
          instagramUrl: parseLink(links.instagramUrl),
          tiktokUrl: parseLink(links.tiktokUrl),
        },
      });
      return NextResponse.json({ ok: true });
    }

    case "refresh-metrics": {
      // Fire the metrics-refresh cron on demand (all linked posts).
      const { inngest } = await import("@/inngest/client");
      await inngest.send({ name: "content-factory/metrics.refresh", data: {} });
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
