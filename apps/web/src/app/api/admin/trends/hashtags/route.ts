import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Hashtag watchlist + daily top-video feed for the admin Trends
 * section (2026-09-17). GET lists watched hashtags and the top 3
 * videos per brand; POST adds a hashtag; PATCH pauses/resumes;
 * DELETE removes a hashtag (cascades its videos).
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

  const { getTopVideos } = await import("@/lib/content-factory/hashtag-trends");
  const [watches, rippleTop, bwkTop] = await Promise.all([
    prisma.hashtagWatch.findMany({
      orderBy: [{ brand: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { videos: true } } },
    }),
    getTopVideos("ripple"),
    getTopVideos("bwk"),
  ]);

  return NextResponse.json({ watches, top: { ripple: rippleTop, bwk: bwkTop } });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { prisma } = auth;

  const body = await req.json();
  const tag = String(body.tag ?? "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  const brand = String(body.brand ?? "");

  if (!tag || !["ripple", "bwk"].includes(brand)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const watch = await prisma.hashtagWatch.upsert({
    where: { brand_tag: { brand, tag } },
    create: { tag, brand, status: "ACTIVE" },
    update: { status: "ACTIVE" },
  });

  return NextResponse.json({ watch });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { prisma } = auth;

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id || !["ACTIVE", "PAUSED"].includes(String(body.status))) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const watch = await prisma.hashtagWatch.update({
    where: { id },
    data: { status: String(body.status) },
  });
  return NextResponse.json({ watch });
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

  await prisma.hashtagWatch.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
