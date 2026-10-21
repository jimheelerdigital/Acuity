import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { getAllPersonaSlugs } from "@/lib/persona-pages";

export const revalidate = 300; // 5 minutes

// Fixed dates: bump when a page's content actually changes. `new Date()`
// told crawlers every page changed on every regeneration.
const HOME_UPDATED = "2026-10-21";
const VOICE_JOURNALING_UPDATED = "2026-10-21";
const RESEARCH_UPDATED = "2026-10-21";
const FOR_PAGES_UPDATED = "2026-10-21";
const SEO_PAGES_UPDATED = "2026-10-21";
const LEGAL_UPDATED = "2026-10-21";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://goripple.io";

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
      select: { slug: true, updatedAt: true },
    });
    const staticSlugs = new Set(BLOG_POSTS.map((p) => p.slug));
    dynamicBlogPages = pieces
      .filter((p) => !staticSlugs.has(p.slug!))
      .map((p) => ({
        url: `${baseUrl}/blog/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      }));
  } catch {
    // DB unavailable at build time — static posts only
  }

  // Blog index changes whenever its newest post does.
  const blogUpdated = [...staticBlogPages, ...dynamicBlogPages].reduce<Date>(
    (latest, p) => {
      const d = p.lastModified ? new Date(p.lastModified) : null;
      return d && d > latest ? d : latest;
    },
    new Date(HOME_UPDATED),
  );

  // ─── Core pages ──────────────────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: HOME_UPDATED,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/voice-journaling`,
      lastModified: VOICE_JOURNALING_UPDATED,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: blogUpdated,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/research/voice-journaling-data`,
      lastModified: RESEARCH_UPDATED,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // /waitlist retired 2026-05-22 (slice 7); the route now 301s to /
    // via next.config.js redirects(). Dropped from the sitemap so
    // crawlers don't keep re-indexing a redirect.
  ];

  // ─── Product / topic pages ───────────────────────────────────────────────
  const seoPages: MetadataRoute.Sitemap = [
    "habit-tracker-app",
    "ai-journal-app",
    "brain-dump-app",
    "mental-load",
    "mood-tracker-app",
  ].map((slug) => ({
    url: `${baseUrl}/${slug}`,
    lastModified: SEO_PAGES_UPDATED,
    changeFrequency: "monthly" as const,
    priority: 0.9,
  }));

  // ─── Legal / support ─────────────────────────────────────────────────────
  const utilityPages: MetadataRoute.Sitemap = [
    { path: "/support", priority: 0.4 },
    { path: "/roadmap", priority: 0.4 },
    { path: "/privacy", priority: 0.3 },
    { path: "/terms", priority: 0.3 },
  ].map(({ path, priority }) => ({
    url: `${baseUrl}${path}`,
    lastModified: LEGAL_UPDATED,
    changeFrequency: "yearly" as const,
    priority,
  }));

  // ─── /for/ landing pages (static routes) ─────────────────────────────────
  const staticForPages: MetadataRoute.Sitemap = [
    "therapy",
    "founders",
    "sleep",
    "decoded",
    "weekly-report",
  ].map((slug) => ({
    url: `${baseUrl}/for/${slug}`,
    lastModified: FOR_PAGES_UPDATED,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  // ─── /for/ persona pages (dynamic routes) ────────────────────────────────
  // Static persona data only; AdLab DB landers are noindex and stay out.
  const personaPages: MetadataRoute.Sitemap = getAllPersonaSlugs().map((slug) => ({
    url: `${baseUrl}/for/${slug}`,
    lastModified: FOR_PAGES_UPDATED,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    ...staticPages,
    ...seoPages,
    ...staticForPages,
    ...personaPages,
    ...staticBlogPages,
    ...dynamicBlogPages,
    ...utilityPages,
  ];
}
