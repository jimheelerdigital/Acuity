import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { getAuthOptions } from "@/lib/auth";
import { notifyUnpublish } from "@/lib/google/indexing";

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { pieceId } = await req.json();
  if (!pieceId) {
    return NextResponse.json({ error: "pieceId required" }, { status: 400 });
  }

  const piece = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    select: {
      id: true,
      slug: true,
      distributedUrl: true,
      impressions: true,
      clicks: true,
      status: true,
    },
  });

  if (!piece) {
    return NextResponse.json({ error: "Piece not found" }, { status: 404 });
  }

  // Find best redirect target
  const bestRedirect = await prisma.contentPiece.findFirst({
    where: {
      type: "BLOG",
      status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] },
      slug: { not: null },
      id: { not: pieceId },
    },
    orderBy: { clicks: "desc" },
    select: { slug: true },
  });

  await prisma.contentPiece.update({
    where: { id: pieceId },
    data: {
      status: "TRIMMED",
      redirectTo: null, // 410 Gone — no redirect
    },
  });

  await prisma.pruneLog.create({
    data: {
      contentPieceId: pieceId,
      reason: "manual_kill",
      impressions: piece.impressions,
      clicks: piece.clicks,
      redirectedToSlug: null,
    },
  });

  if (piece.distributedUrl) {
    notifyUnpublish(piece.distributedUrl).catch((err) =>
      console.error("[auto-blog/kill] Indexing notification failed:", err)
    );
  }

  return NextResponse.json({ ok: true, redirectedTo: bestRedirect?.slug });
}
