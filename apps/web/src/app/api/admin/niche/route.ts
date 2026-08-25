import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Admin API for the Niche Research Lab (2026-08-24).
 *
 * GET  /api/admin/niche — tracked accounts + ranked overperforming posts
 *   Query params: days (post window, default 30), limit (default 50)
 * POST /api/admin/niche — actions:
 *   { action: "add-account", handle, notes? }
 *   { action: "toggle-active", accountId }
 *   { action: "update-notes", accountId, notes }
 *   { action: "delete-account", accountId }
 *   { action: "scrape-now" }  → fires the nightly Inngest scrape manually
 */

async function requireAdmin() {
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
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(req.url);
  const days = Math.min(Number(url.searchParams.get("days")) || 30, 365);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const since = new Date(Date.now() - days * 86_400_000);

  const [accounts, topPosts, latestMemo, hashtags] = await Promise.all([
    prisma.nicheAccount.findMany({
      orderBy: [{ active: "desc" }, { addedAt: "desc" }],
      include: { _count: { select: { posts: true } } },
    }),
    prisma.nichePost.findMany({
      where: { postedAt: { gte: since }, engagementRatio: { not: null } },
      orderBy: { engagementRatio: "desc" },
      take: limit,
      include: {
        account: { select: { handle: true, displayName: true, followers: true } },
      },
    }),
    prisma.nicheMemo.findFirst({ orderBy: { weekOf: "desc" } }),
    prisma.nicheHashtag.findMany({
      where: { score: { not: null } },
      orderBy: { score: "desc" },
      take: 30,
    }),
  ]);

  // Engagement queue: recent breakout posts with a drafted comment that
  // Keenan hasn't engaged with yet. Manual by design — never auto-posted.
  const engagementQueue = await prisma.nichePost.findMany({
    where: {
      suggestedComment: { not: null },
      engagedAt: null,
      postedAt: { gte: new Date(Date.now() - 14 * 86_400_000) },
    },
    orderBy: { engagementRatio: "desc" },
    take: 15,
    include: { account: { select: { handle: true, displayName: true, followers: true } } },
  });

  return NextResponse.json({
    apifyConfigured: Boolean(process.env.APIFY_TOKEN),
    accounts,
    topPosts,
    latestMemo,
    engagementQueue,
    hashtags,
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body?.action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  switch (body.action) {
    case "add-account": {
      const handle = String(body.handle || "")
        .trim()
        .replace(/^@/, "")
        .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
        .replace(/\/.*$/, "")
        .toLowerCase();
      if (!/^[a-z0-9._]{1,30}$/.test(handle)) {
        return NextResponse.json({ error: "Invalid handle" }, { status: 400 });
      }
      const account = await prisma.nicheAccount.upsert({
        where: { platform_handle: { platform: "INSTAGRAM", handle } },
        create: {
          platform: "INSTAGRAM",
          handle,
          notes: body.notes ? String(body.notes) : null,
        },
        update: { active: true },
      });
      return NextResponse.json({ ok: true, account });
    }

    case "toggle-active": {
      const account = await prisma.nicheAccount.findUnique({
        where: { id: String(body.accountId) },
        select: { active: true },
      });
      if (!account) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const updated = await prisma.nicheAccount.update({
        where: { id: String(body.accountId) },
        data: { active: !account.active },
      });
      return NextResponse.json({ ok: true, account: updated });
    }

    case "update-notes": {
      const updated = await prisma.nicheAccount.update({
        where: { id: String(body.accountId) },
        data: { notes: String(body.notes ?? "") || null },
      });
      return NextResponse.json({ ok: true, account: updated });
    }

    case "delete-account": {
      await prisma.nicheAccount.delete({ where: { id: String(body.accountId) } });
      return NextResponse.json({ ok: true });
    }

    case "scrape-now": {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({ name: "content-factory/niche.scrape", data: {} });
      return NextResponse.json({ ok: true, triggered: true });
    }

    case "mark-engaged": {
      await prisma.nichePost.update({
        where: { id: String(body.postId) },
        data: { engagedAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    case "memo-now": {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({ name: "content-factory/niche.memo", data: {} });
      return NextResponse.json({ ok: true, triggered: true });
    }

    case "discover-now": {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({ name: "content-factory/niche.discover", data: {} });
      return NextResponse.json({ ok: true, triggered: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
