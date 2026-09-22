import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Audience Pulse history for the admin Trends section (2026-09-17).
 * Returns the last 14 Reddit trend digests (newest first, both
 * brands) including the raw source posts for audit.
 */
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

  const digests = await prisma.redditTrendDigest.findMany({
    orderBy: [{ date: "desc" }, { brand: "asc" }],
    take: 14,
    select: {
      id: true,
      brand: true,
      date: true,
      themes: true,
      sourcePosts: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ digests });
}
