import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { PERSONA_PAGES } from "@/lib/persona-pages";

// Meta ad landing pages — noindex'd, excluded from sitemap
const AD_LANDING_SLUGS = new Set([
  "therapy",
  "founders",
  "sleep",
  "decoded",
  "weekly-report",
]);

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://getacuity.io";
  const lastModified = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/waitlist`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/voice-journaling`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];

  const blogPages: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const personaPages: MetadataRoute.Sitemap = PERSONA_PAGES
    .filter((p) => !AD_LANDING_SLUGS.has(p.slug))
    .map((p) => ({
      url: `${baseUrl}/for/${p.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));

  return [...staticPages, ...personaPages, ...blogPages];
}
