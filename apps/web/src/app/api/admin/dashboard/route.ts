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

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalSignups,
    signupsBySource,
    signupsOverTime,
    recentSignups,
    emailStepCounts,
  ] = await Promise.all([
    // Total waitlist signups
    prisma.waitlist.count(),

    // Signups by source
    prisma.$queryRaw<{ source: string | null; count: bigint }[]>`
      SELECT source, COUNT(*)::bigint as count
      FROM "Waitlist"
      GROUP BY source
      ORDER BY count DESC
    `,

    // Signups per day for last 30 days
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE("createdAt")::text as date, COUNT(*)::bigint as count
      FROM "Waitlist"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,

    // Most recent 10 signups
    prisma.waitlist.findMany({
      select: { name: true, email: true, source: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),

    // Users at each email step
    prisma.$queryRaw<{ emailSequenceStep: number; count: bigint }[]>`
      SELECT "emailSequenceStep", COUNT(*)::bigint as count
      FROM "Waitlist"
      GROUP BY "emailSequenceStep"
      ORDER BY "emailSequenceStep" ASC
    `,
  ]);

  return NextResponse.json({
    totalSignups,
    signupsBySource: signupsBySource.map((r) => ({
      source: r.source || "unknown",
      count: Number(r.count),
    })),
    signupsOverTime: signupsOverTime.map((r) => ({
      date: r.date,
      count: Number(r.count),
    })),
    recentSignups: recentSignups.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    emailStepCounts: emailStepCounts.map((r) => ({
      step: r.emailSequenceStep,
      count: Number(r.count),
    })),
  });
}
