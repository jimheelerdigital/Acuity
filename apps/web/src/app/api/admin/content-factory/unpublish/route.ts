import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

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

  const piece = await prisma.contentPiece.update({
    where: { id: pieceId },
    data: {
      status: "APPROVED",
      distributedAt: null,
      distributedUrl: null,
      // Keep slug so re-publishing uses the same URL
    },
  });

  return NextResponse.json({ ok: true, piece });
}
