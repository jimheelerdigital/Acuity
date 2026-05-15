import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { pieceId } = await req.json();
  if (!pieceId) {
    return NextResponse.json({ error: "pieceId required" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  await prisma.contentPiece.delete({ where: { id: pieceId } });

  return NextResponse.json({ ok: true });
}
