import type { MetadataRoute } from "next";

const DISALLOWED = [
  "/admin/",
  "/api/",
  "/dashboard/",
  "/home/",
  "/tasks/",
  "/goals/",
  "/insights/",
  "/auth/",
  "/upgrade/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED,
      },
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: DISALLOWED,
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: DISALLOWED,
      },
      {
        userAgent: "anthropic-ai",
        allow: "/",
        disallow: DISALLOWED,
      },
      {
        userAgent: "ClaudeBot",
        allow: "/",
        disallow: DISALLOWED,
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: DISALLOWED,
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: DISALLOWED,
      },
    ],
    sitemap: "https://getacuity.io/sitemap.xml",
  };
}
