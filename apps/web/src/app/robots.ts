import type { MetadataRoute } from "next";

// No trailing slashes, so "/home" also covers "/home" itself. AI crawlers
// (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…) follow the "*" group;
// they had identical rules, so they no longer get their own.
const DISALLOWED = [
  "/admin",
  "/api",
  "/dashboard",
  "/home",
  "/tasks",
  "/goals",
  "/insights",
  "/auth",
  "/upgrade",
  "/u/",
  "/go/",
  "/oauth",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED,
      },
    ],
    sitemap: "https://goripple.io/sitemap.xml",
  };
}
