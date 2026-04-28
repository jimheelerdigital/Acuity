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

  // Topic queue stats
  const [queued, inProgress, published, skipped] = await Promise.all([
    prisma.blogTopicQueue.count({ where: { status: "QUEUED" } }),
    prisma.blogTopicQueue.count({ where: { status: "IN_PROGRESS" } }),
    prisma.blogTopicQueue.count({ where: { status: "PUBLISHED" } }),
    prisma.blogTopicQueue.count({ where: { status: "SKIPPED" } }),
  ]);

  // Recent auto-published posts
  const recentPosts = await prisma.contentPiece.findMany({
    where: {
      type: "BLOG",
      status: {
        in: [
          "AUTO_PUBLISHED",
          "PRUNED_DAY7",
          "PRUNED_DAY30",
          "PRUNED_DAY90",
          "GENERATION_FAILED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      publishedAt: true,
      distributedUrl: true,
      impressions: true,
      clicks: true,
      lastGscSyncAt: true,
      targetKeyword: true,
      createdAt: true,
    },
  });

  // Prune logs
  const pruneLogs = await prisma.pruneLog.findMany({
    orderBy: { prunedAt: "desc" },
    take: 20,
  });

  // Indexing API health
  const lastSuccessfulIndex = await prisma.indexingLog.findFirst({
    where: { success: true },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, url: true },
  });

  const recentFailures = await prisma.indexingLog.count({
    where: {
      success: false,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  // Total stats
  const totalPublished = await prisma.contentPiece.count({
    where: { type: "BLOG", status: "AUTO_PUBLISHED" },
  });
  const totalPruned = await prisma.contentPiece.count({
    where: {
      type: "BLOG",
      status: { in: ["PRUNED_DAY7", "PRUNED_DAY30", "PRUNED_DAY90"] },
    },
  });

  return NextResponse.json({
    topicQueue: { queued, inProgress, published, skipped },
    recentPosts,
    pruneLogs,
    indexingHealth: {
      lastSuccess: lastSuccessfulIndex,
      recentFailures,
    },
    stats: { totalPublished, totalPruned },
  });
}
