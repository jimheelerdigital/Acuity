import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

import ContentFactoryClient from "./content-factory-client";

export const dynamic = "force-dynamic";

export default async function ContentFactoryPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/admin/content-factory");
  }

  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    redirect("/dashboard");
  }

  // Load all data server-side
  const [pendingPieces, readyPieces, distributedPieces, latestBriefing] =
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
    ]);

  return (
    <ContentFactoryClient
      pendingPieces={JSON.parse(JSON.stringify(pendingPieces))}
      readyPieces={JSON.parse(JSON.stringify(readyPieces))}
      distributedPieces={JSON.parse(JSON.stringify(distributedPieces))}
      latestBriefing={
        latestBriefing
          ? JSON.parse(JSON.stringify(latestBriefing))
          : null
      }
    />
  );
}
