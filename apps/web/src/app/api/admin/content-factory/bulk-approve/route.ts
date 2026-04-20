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

  const { pieceIds } = await req.json();
  if (!Array.isArray(pieceIds) || pieceIds.length === 0) {
    return NextResponse.json(
      { error: "pieceIds array required" },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    pieceIds.map((id: string) =>
      prisma.contentPiece.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedBy: session.user.id,
        },
      })
    )
  );

  return NextResponse.json({ ok: true, approvedCount: pieceIds.length });
}
