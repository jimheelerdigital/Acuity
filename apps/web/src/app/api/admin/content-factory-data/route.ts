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

  const [pendingPieces, readyPieces, distributedPieces, latestBriefing, activeJob] =
    await Promise.all([
      prisma.contentPiece.findMany({
        where: { status: "PENDING_REVIEW" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.contentPiece.findMany({
        where: { status: { in: ["APPROVED", "EDITED"] } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.contentPiece.findMany({
        where: { status: "DISTRIBUTED" },
        orderBy: { distributedAt: "desc" },
      }),
      prisma.contentBriefing.findFirst({
        orderBy: { date: "desc" },
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
    pendingPieces: JSON.parse(JSON.stringify(pendingPieces)),
    readyPieces: JSON.parse(JSON.stringify(readyPieces)),
    distributedPieces: JSON.parse(JSON.stringify(distributedPieces)),
    latestBriefing: latestBriefing
      ? JSON.parse(JSON.stringify(latestBriefing))
      : null,
    activeJobId: activeJob?.id ?? null,
  });
}
