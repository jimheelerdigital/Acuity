import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/dashboard/",
          "/tasks/",
          "/goals/",
          "/insights/",
          "/auth/",
          "/upgrade/",
        ],
      },
    ],
    sitemap: "https://getacuity.io/sitemap.xml",
  };
}
