import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
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

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  // Only fetch content types relevant to the social content factory
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const socialTypes: any[] = ["TWITTER", "TIKTOK", "INSTAGRAM"];

  const [pieces, activeJob] = await Promise.all([
    prisma.contentPiece.findMany({
      where: { type: { in: socialTypes } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.generationJob.findFirst({
      where: {
        status: { in: ["QUEUED", "RUNNING"] },
        startedAt: { gte: tenMinutesAgo },
      },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    }),
  ]);

  return NextResponse.json({
    pieces: JSON.parse(JSON.stringify(pieces)),
    activeJobId: activeJob?.id ?? null,
  });
}
