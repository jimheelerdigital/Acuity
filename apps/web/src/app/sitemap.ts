import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { getAllPersonaSlugs } from "@/lib/persona-pages";

export const revalidate = 300; // 5 minutes

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://getacuity.io";
  const lastModified = new Date();

  // ─── Core pages ──────────────────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/voice-journaling`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/waitlist`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  // ─── /for/ landing pages (static routes) ─────────────────────────────────
  const staticForPages: MetadataRoute.Sitemap = [
    "therapy",
    "founders",
    "sleep",
    "decoded",
    "weekly-report",
  ].map((slug) => ({
    url: `${baseUrl}/for/${slug}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  // ─── /for/ persona pages (dynamic routes) ────────────────────────────────
  const personaSlugs = getAllPersonaSlugs();
  const personaPages: MetadataRoute.Sitemap = personaSlugs.map((slug) => ({
    url: `${baseUrl}/for/${slug}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // ─── Static blog posts from blog-posts.ts ────────────────────────────────
  const staticBlogPages: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // ─── Dynamic blog posts from ContentPiece ────────────────────────────────
  let dynamicBlogPages: MetadataRoute.Sitemap = [];
  try {
    const { prisma } = await import("@/lib/prisma");
    const pieces = await prisma.contentPiece.findMany({
      where: {
        type: "BLOG",
        status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] },
        slug: { not: null },
      },
      select: { slug: true, distributedAt: true },
    });
    const staticSlugs = new Set(BLOG_POSTS.map((p) => p.slug));
    dynamicBlogPages = pieces
      .filter((p) => !staticSlugs.has(p.slug!))
      .map((p) => ({
        url: `${baseUrl}/blog/${p.slug}`,
        lastModified: p.distributedAt ?? new Date(),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      }));
  } catch {
    // DB unavailable at build time — static posts only
  }

  return [
    ...staticPages,
    ...staticForPages,
    ...personaPages,
    ...staticBlogPages,
    ...dynamicBlogPages,
  ];
}
