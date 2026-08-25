import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Admin API for the Niche Research Lab (2026-08-24, reworked 2026-08-25).
 *
 * GET  /api/admin/niche — profile, today's viral feed (IG + TikTok),
 *   topic suggestions, suggested + tracked accounts, hashtags, memo
 * POST /api/admin/niche — actions:
 *   { action: "approve-account", accountId }    → start tracking a suggestion
 *   { action: "ignore-account", accountId }     → delete a suggestion
 *   { action: "add-account", handle, notes? }   → manually track an account
 *   { action: "toggle-active" | "update-notes" | "delete-account", accountId }
 *   { action: "mark-engaged", postId }
 *   { action: "generate-suggestion", suggestionId } → fire one-off generation
 *   { action: "dismiss-suggestion", suggestionId }
 *   { action: "refresh-niche" }                 → re-infer the niche profile
 *   { action: "scrape-now" | "memo-now" | "discover-now" }
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
  const days = Math.min(Number(url.searchParams.get("days")) || 2, 30);
  const since = new Date(Date.now() - days * 86_400_000);

  const [
    profile,
    viralFeed,
    suggestions,
    suggestedAccounts,
    trackedAccounts,
    latestMemo,
    hashtags,
  ] = await Promise.all([
    prisma.nicheProfile.findUnique({ where: { id: "singleton" } }),
    // Today's viral posts across both platforms, drafted comment included.
    prisma.nichePost.findMany({
      where: {
        postedAt: { gte: since },
        OR: [{ viralScore: { gte: 1.5 } }, { engagementRatio: { gte: 1.3 } }],
      },
      orderBy: [{ viralScore: "desc" }, { engagementRatio: "desc" }],
      take: 40,
      include: {
        account: { select: { handle: true, displayName: true, followers: true } },
      },
    }),
    prisma.nicheTopicSuggestion.findMany({
      where: { status: "SUGGESTED" },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    // Accounts the discovery crawl found — awaiting Keenan's approve/ignore.
    prisma.nicheAccount.findMany({
      where: { discovered: true, active: false },
      orderBy: { addedAt: "desc" },
      take: 20,
      include: { _count: { select: { posts: true } } },
    }),
    prisma.nicheAccount.findMany({
      where: { OR: [{ discovered: false }, { active: true }] },
      orderBy: [{ active: "desc" }, { addedAt: "desc" }],
      include: { _count: { select: { posts: true } } },
    }),
    prisma.nicheMemo.findFirst({ orderBy: { weekOf: "desc" } }),
    prisma.nicheHashtag.findMany({
      where: { score: { not: null } },
      orderBy: { score: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({
    apifyConfigured: Boolean(process.env.APIFY_TOKEN),
    profile,
    viralFeed,
    suggestions,
    suggestedAccounts,
    trackedAccounts,
    latestMemo,
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
        update: { active: true, discovered: false },
      });
      return NextResponse.json({ ok: true, account });
    }

    case "approve-account": {
      const account = await prisma.nicheAccount.update({
        where: { id: String(body.accountId) },
        data: { active: true },
      });
      return NextResponse.json({ ok: true, account });
    }

    case "ignore-account": {
      // Only ever deletes an unapproved discovery suggestion.
      await prisma.nicheAccount.deleteMany({
        where: { id: String(body.accountId), discovered: true, active: false },
      });
      return NextResponse.json({ ok: true });
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

    case "mark-engaged": {
      await prisma.nichePost.update({
        where: { id: String(body.postId) },
        data: { engagedAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    case "generate-suggestion": {
      const suggestion = await prisma.nicheTopicSuggestion.findUnique({
        where: { id: String(body.suggestionId) },
      });
      if (!suggestion || suggestion.status !== "SUGGESTED") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "carousel/generate.one-off",
        data: {
          suggestionId: suggestion.id,
          headline: suggestion.headline,
          angle: suggestion.angle,
        },
      });
      return NextResponse.json({ ok: true, triggered: true });
    }

    case "dismiss-suggestion": {
      await prisma.nicheTopicSuggestion.update({
        where: { id: String(body.suggestionId) },
        data: { status: "DISMISSED" },
      });
      return NextResponse.json({ ok: true });
    }

    case "refresh-niche": {
      const { inferNiche } = await import(
        "@/lib/content-factory/niche-research"
      );
      const inferred = await inferNiche();
      if (!inferred) {
        return NextResponse.json(
          { error: "Could not infer the niche — post some carousels first" },
          { status: 422 }
        );
      }
      const profile = await prisma.nicheProfile.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", ...inferred },
        update: inferred,
      });
      return NextResponse.json({ ok: true, profile });
    }

    case "scrape-now": {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({ name: "content-factory/niche.scrape", data: {} });
      return NextResponse.json({ ok: true, triggered: true });
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
