/**
 * POST /api/admin/youtube/refresh — bring posted Shorts up to the current
 * YouTube settings (thumbnail, quiz link, category, AI disclosure).
 * Body { brand?: "mythicals", limit?: number }. Auth: admin or CRON bearer.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const body = (await req.json().catch(() => ({}))) as { brand?: string; limit?: number };
  const brand = (body.brand ?? "mythicals") as "mythicals" | "ripple" | "bwk";
  const { youtubeAccount, refreshShortMetadata } = await import("@/lib/content-factory/youtube-publish");
  const account = youtubeAccount(brand);
  if (!account) return NextResponse.json({ error: `no YouTube account for ${brand}` }, { status: 400 });
  const rows = await prisma.socialPublish.findMany({
    where: { platform: "youtube", accountKey: brand, status: "POSTED", externalId: { not: null } },
    orderBy: { postedAt: "desc" },
    take: Math.min(30, body.limit ?? 20),
    select: { externalId: true, carouselPost: { select: { headline: true, caption: true, slides: { where: { kind: "COVER" }, select: { imageUrl: true } } } } },
  });
  const results: Record<string, unknown>[] = [];
  for (const r of rows) {
    const out = await refreshShortMetadata(account, r.externalId!, {
      headline: r.carouselPost.headline,
      caption: r.carouselPost.caption ?? "",
      coverUrl: r.carouselPost.slides[0]?.imageUrl ?? null,
    });
    results.push({ videoId: r.externalId, headline: r.carouselPost.headline, ...out });
    await new Promise((res) => setTimeout(res, 1500));
  }
  return NextResponse.json({ count: results.length, results });
}
