import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { getAuthOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
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

  const filter = req.nextUrl.searchParams.get("filter");
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const where: Record<string, unknown> = {
    runDate: { gte: thirtyDaysAgo },
  };

  if (filter === "would_trim") {
    where.recommendedAction = "trim";
    where.isDryRun = true;
  }

  const runs = await prisma.blogPrunerRun.findMany({
    where,
    orderBy: { runDate: "desc" },
    take: 200,
  });

  return NextResponse.json({ runs });
}
