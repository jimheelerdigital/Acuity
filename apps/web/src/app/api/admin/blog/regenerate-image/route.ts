/**
 * POST /api/admin/blog/regenerate-image — regenerate hero image for a specific post
 * Accepts { pieceId }
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { generateAndStoreBlogImage } from "@/lib/blog-image";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { pieceId } = await req.json();
  if (!pieceId) {
    return NextResponse.json({ error: "pieceId required" }, { status: 400 });
  }

  const piece = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    select: { slug: true, title: true, body: true, targetKeyword: true },
  });

  if (!piece || !piece.slug) {
    return NextResponse.json({ error: "Post not found or has no slug" }, { status: 404 });
  }

  // Generate a prompt from the post content
  const imagePrompt = `Abstract, editorial style — no text, no logos, no faces. Moody lighting, muted purple and indigo tones on dark background. Visual metaphor for: ${piece.title}. Target keyword: ${piece.targetKeyword || "voice journaling"}.`;

  const imageUrl = await generateAndStoreBlogImage(piece.slug, imagePrompt);

  if (!imageUrl) {
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }

  await prisma.contentPiece.update({
    where: { id: pieceId },
    data: { heroImageUrl: imageUrl },
  });

  return NextResponse.json({ imageUrl });
}
