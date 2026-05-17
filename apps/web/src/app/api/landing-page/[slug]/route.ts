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

  const landingPage = await prisma.adLabLandingPage.findUnique({
    where: { slug: params.slug },
  });

  if (!landingPage) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ landingPage });
}
