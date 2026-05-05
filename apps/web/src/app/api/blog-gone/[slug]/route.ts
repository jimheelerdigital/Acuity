/**
 * Returns HTTP 410 Gone for blog posts that have been trimmed.
 *
 * Two access paths:
 * 1. Googlebot re-crawls a URL after receiving a URL_DELETED notification
 *    via the Indexing API — the blog [slug] page calls notFound() (404),
 *    but this endpoint exists as the canonical 410 source.
 * 2. The blog [slug] page component detects TRIMMED status and rewrites
 *    internally to this handler via next/navigation redirect.
 *
 * In practice, the Indexing API URL_DELETED + the page's 404 + robots noindex
 * achieves deindexing. This route provides the true 410 as an additional signal.
 */

import { NextRequest, NextResponse } from "next/server";

async function handle410(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // Verify this post is actually trimmed
  try {
    const { prisma } = await import("@/lib/prisma");
    const post = await prisma.contentPiece.findFirst({
      where: {
        slug: params.slug,
        type: "BLOG",
        status: "TRIMMED",
      },
      select: { id: true },
    });

    if (!post) {
      // Not actually trimmed — redirect to the normal blog page
      return NextResponse.redirect(new URL(`/blog/${params.slug}`, req.url));
    }
  } catch {
    // DB error — return 404 as safe fallback
    return new NextResponse(null, { status: 404 });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex, nofollow" />
  <title>410 Gone</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; color: #333; }
    h1 { font-size: 1.5rem; }
    a { color: #7C5CFC; }
  </style>
</head>
<body>
  <h1>This page has been removed</h1>
  <p>This blog post has been permanently removed and is no longer available.</p>
  <p><a href="/blog">Browse our blog</a> for current content.</p>
</body>
</html>`;

  return new NextResponse(html, {
    status: 410,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(
  req: NextRequest,
  context: { params: { slug: string } }
) {
  return handle410(req, context);
}

export async function HEAD(
  req: NextRequest,
  context: { params: { slug: string } }
) {
  return handle410(req, context);
}
