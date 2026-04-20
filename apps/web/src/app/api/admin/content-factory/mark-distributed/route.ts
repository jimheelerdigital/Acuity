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

  const body = (await req.json().catch(() => null)) as {
    pieceId?: unknown;
    distributedUrl?: unknown;
  } | null;
  const pieceId = typeof body?.pieceId === "string" ? body.pieceId : null;
  const distributedUrl =
    typeof body?.distributedUrl === "string" ? body.distributedUrl : null;
  if (!pieceId || !distributedUrl) {
    return NextResponse.json(
      { error: "pieceId and distributedUrl required (strings)" },
      { status: 400 }
    );
  }
  // URL must be an http(s) URL — not a javascript: or file: scheme
  // that a compromised admin session could use to smuggle a payload
  // into a field that's later displayed somewhere.
  try {
    const parsed = new URL(distributedUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json(
        { error: "distributedUrl must be http(s)" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "distributedUrl is not a valid URL" },
      { status: 400 }
    );
  }

  const piece = await prisma.contentPiece.update({
    where: { id: pieceId },
    data: {
      status: "DISTRIBUTED",
      distributedAt: new Date(),
      distributedUrl,
    },
  });

  return NextResponse.json({ ok: true, piece });
}
