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

  const { pieceId } = await req.json();
  if (!pieceId) {
    return NextResponse.json({ error: "pieceId required" }, { status: 400 });
  }

  const piece = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    select: { id: true, targetKeyword: true, title: true, status: true },
  });

  if (!piece) {
    return NextResponse.json({ error: "Piece not found" }, { status: 404 });
  }

  if (piece.status !== "GENERATION_FAILED") {
    return NextResponse.json(
      { error: "Only GENERATION_FAILED posts can be retried" },
      { status: 400 }
    );
  }

  // Find the matching SKIPPED topic queue entry to re-queue it
  const topic = await prisma.blogTopicQueue.findFirst({
    where: {
      targetKeyword: piece.targetKeyword ?? "",
      status: "SKIPPED",
    },
    orderBy: { createdAt: "desc" },
  });

  if (topic) {
    await prisma.blogTopicQueue.update({
      where: { id: topic.id },
      data: { status: "QUEUED" },
    });
  } else {
    // No matching topic found — create a new queue entry
    await prisma.blogTopicQueue.create({
      data: {
        topic: piece.title,
        persona: "general",
        targetKeyword: piece.targetKeyword ?? piece.title,
        searchIntent: "informational",
      },
    });
  }

  // Delete the failed content piece so it doesn't clutter the dashboard
  await prisma.contentPiece.delete({ where: { id: pieceId } });

  // Trigger immediate generation
  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "auto-blog/generate.requested",
    data: { skipDelay: true },
  });

  return NextResponse.json({ ok: true });
}
