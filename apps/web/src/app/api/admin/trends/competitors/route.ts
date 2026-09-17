import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Competitor account management for the admin Trends section
 * (2026-09-17). GET lists accounts with their recent outliers/briefs;
 * POST adds a handle; PATCH updates status/niche/notes; DELETE
 * removes an account (cascades its posts).
 */
async function requireAdmin() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { prisma };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { prisma } = auth;

  const [accounts, outliers] = await Promise.all([
    prisma.competitorAccount.findMany({
      orderBy: [{ brand: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { posts: true } } },
    }),
    prisma.competitorPost.findMany({
      where: {
        isOutlier: true,
        scrapedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: [{ outlierScore: "desc" }],
      take: 40,
      select: {
        id: true,
        accountId: true,
        url: true,
        caption: true,
        views: true,
        likes: true,
        comments: true,
        shares: true,
        thumbnailUrl: true,
        postedAt: true,
        outlierScore: true,
        brief: true,
        briefAt: true,
        mandatedAt: true,
        account: {
          select: { handle: true, platform: true, brand: true },
        },
      },
    }),
  ]);

  return NextResponse.json({ accounts, outliers });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { prisma } = auth;

  const body = await req.json();
  const handle = String(body.handle ?? "")
    .trim()
    .replace(/^@/, "");
  const platform = String(body.platform ?? "");
  const brand = String(body.brand ?? "");
  const niche = body.niche ? String(body.niche).trim() : null;

  if (
    !handle ||
    !["tiktok", "instagram"].includes(platform) ||
    !["ripple", "bwk"].includes(brand)
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const account = await prisma.competitorAccount.upsert({
    where: { platform_handle: { platform, handle } },
    create: { handle, platform, brand, niche, status: "ACTIVE" },
    update: { brand, niche: niche ?? undefined, status: "ACTIVE" },
  });

  return NextResponse.json({ account });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { prisma } = auth;

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const data: { status?: string; niche?: string | null; notes?: string | null } = {};
  if (body.status === "ACTIVE" || body.status === "PAUSED") data.status = body.status;
  if ("niche" in body) data.niche = body.niche ? String(body.niche) : null;
  if ("notes" in body) data.notes = body.notes ? String(body.notes) : null;

  const account = await prisma.competitorAccount.update({ where: { id }, data });
  return NextResponse.json({ account });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { prisma } = auth;

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  await prisma.competitorAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
