import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { slugify, uniqueSlug } from "@/lib/content-factory/slug";
import { notifyPublish } from "@/lib/google/indexing";

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

  // Fetch the piece to check its type
  const existing = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    select: { type: true, title: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Piece not found" }, { status: 404 });
  }

  // BLOG posts auto-publish on approve
  if (existing.type === "BLOG") {
    const slug = await uniqueSlug(prisma, slugify(existing.title));
    const distributedUrl = `https://getacuity.io/blog/${slug}`;

    const piece = await prisma.contentPiece.update({
      where: { id: pieceId },
      data: {
        status: "DISTRIBUTED",
        reviewedAt: new Date(),
        reviewedBy: session.user.id,
        slug,
        distributedAt: new Date(),
        distributedUrl,
      },
    });

    // Fire-and-forget indexing notification
    notifyPublish(distributedUrl).catch((err) =>
      console.error("[approve] Indexing notification failed:", err)
    );

    return NextResponse.json({ ok: true, piece, autoPublished: true });
  }

  // All other types: normal approve flow
  const piece = await prisma.contentPiece.update({
    where: { id: pieceId },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedBy: session.user.id,
    },
  });

  return NextResponse.json({ ok: true, piece });
}
