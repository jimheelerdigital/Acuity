import { NextResponse } from "next/server";

export const revalidate = 300; // Cache for 5 minutes

/**
 * GET /api/landing-page/[slug]
 * Public endpoint — returns landing page data for the /for/[slug] route.
 * No auth required (public marketing page).
 */
export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  const { prisma } = await import("@/lib/prisma");

  try {
    const landingPage = await prisma.adLabLandingPage.findUnique({
      where: { slug: params.slug },
    });

    if (!landingPage) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ landingPage });
  } catch (err) {
    // If the query fails (e.g., new column not yet added to DB), fall back to raw query
    // that only selects the columns that existed before the schema change
    console.error("[landing-page] Prisma query failed, trying fallback:", err instanceof Error ? err.message : err);
    try {
      const result = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT id, "experimentId", slug, "heroHeadline", "heroSubheadline", "painPoints",
                "valuePropHeadline", "valueProps", "testimonialQuote", "testimonialName",
                "ctaText", "metaTitle", "metaDescription", "createdAt", "updatedAt"
         FROM adlab_landing_pages WHERE slug = $1 LIMIT 1`,
        params.slug
      );
      if (!result || result.length === 0) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      // Normalize: add closingHeadline as null if missing
      const row = result[0];
      return NextResponse.json({
        landingPage: { ...row, closingHeadline: row.closingHeadline ?? null },
      });
    } catch (fallbackErr) {
      console.error("[landing-page] Fallback query also failed:", fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  }
}
