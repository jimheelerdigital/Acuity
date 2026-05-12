/**
 * POST /api/admin/blog/backfill-images — generate hero images for all posts missing them
 * Returns progress updates as JSON.
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { generateAndStoreBlogImage } from "@/lib/blog-image";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const posts = await prisma.contentPiece.findMany({
    where: {
      type: "BLOG",
      status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] },
      slug: { not: null },
      heroImageUrl: null,
    },
    select: { id: true, slug: true, title: true, targetKeyword: true },
    orderBy: { createdAt: "desc" },
  });

  if (posts.length === 0) {
    return NextResponse.json({ message: "No posts need images", processed: 0 });
  }

  const results: { slug: string; success: boolean; imageUrl?: string }[] = [];

  for (const post of posts) {
    const imagePrompt = `Abstract, editorial style — no text, no logos, no faces. Moody lighting, muted purple and indigo tones on dark background. Visual metaphor for: ${post.title}. Target keyword: ${post.targetKeyword || "voice journaling"}.`;

    // Rate limit: 3s between calls
    if (results.length > 0) {
      await new Promise((r) => setTimeout(r, 3000));
    }

    try {
      const imageUrl = await generateAndStoreBlogImage(post.slug!, imagePrompt);
      if (imageUrl) {
        await prisma.contentPiece.update({
          where: { id: post.id },
          data: { heroImageUrl: imageUrl },
        });
        results.push({ slug: post.slug!, success: true, imageUrl });
      } else {
        results.push({ slug: post.slug!, success: false });
      }
    } catch (err) {
      console.error(`[blog-backfill] Failed for ${post.slug}:`, err);
      results.push({ slug: post.slug!, success: false });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  return NextResponse.json({
    message: `Backfilled ${succeeded}/${posts.length} posts`,
    processed: posts.length,
    succeeded,
    results,
  });
}
