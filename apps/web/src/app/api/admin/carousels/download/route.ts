import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import JSZip from "jszip";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/carousels/download?postId=xxx
 * Downloads all slides of a carousel post as a ZIP file.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const postId = new URL(req.url).searchParams.get("postId");
  if (!postId) {
    return NextResponse.json({ error: "postId required" }, { status: 400 });
  }

  const post = await prisma.carouselPost.findUnique({
    where: { id: postId },
    include: { slides: { orderBy: { order: "asc" } } },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const zip = new JSZip();

  // Download each slide image and add to ZIP.
  // Named 01-cover.jpg, 02-reason.jpg ... 09-cta.jpg so Photos preserves order.
  for (const slide of post.slides) {
    try {
      const res = await fetch(slide.imageUrl);
      if (!res.ok) {
        console.warn(`[carousel-download] Failed to fetch slide ${slide.id}: ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const num = String(slide.order + 1).padStart(2, "0");
      zip.file(`${num}-${slide.kind.toLowerCase()}.jpg`, buf);

      // Animated cover video (post as the first slide on Instagram)
      if (slide.videoUrl) {
        const vidRes = await fetch(slide.videoUrl);
        if (vidRes.ok) {
          const vidBuf = Buffer.from(await vidRes.arrayBuffer());
          zip.file(`${num}-${slide.kind.toLowerCase()}.mp4`, vidBuf);
        } else {
          console.warn(`[carousel-download] Failed to fetch video for slide ${slide.id}: ${vidRes.status}`);
        }
      }
    } catch (err) {
      console.warn(`[carousel-download] Error fetching slide ${slide.id}:`, err);
    }
  }

  // Add caption as a text file
  zip.file("caption.txt", post.caption);

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${post.topicSlug}-carousel.zip"`,
    },
  });
}
