import { NextResponse } from "next/server";
import { generateLandingPage } from "@/lib/adlab/landing-page";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/**
 * ⚠️ SECURITY (2026-08-20): this route shipped with NO authentication on
 * GET, POST or PATCH. Every sibling admin route uses `requireAdmin`; this
 * one was missed.
 *
 * The middleware does NOT cover it — its matcher is `/admin/adlab/:path*`,
 * which guards the PAGE, not `/api/admin/*`. Verified against production:
 * an unauthenticated GET returned 200, while the guarded
 * /api/admin/entitlement-drift returned 401.
 *
 * Impact: anyone could read landing-page rows, PATCH them, and POST to
 * trigger `generateLandingPage()` — an LLM call, so unauthenticated spend.
 *
 * Every handler below must start with the guard. Do not add a handler here
 * without it.
 */

/**
 * POST /api/admin/adlab/landing-page
 * Generate + save a landing page for an AdLab experiment.
 * Body: { experimentId: string }
 *
 * GET /api/admin/adlab/landing-page?experimentId=xxx
 * Fetch existing landing page for an experiment.
 *
 * PATCH /api/admin/adlab/landing-page
 * Update landing page fields.
 * Body: { experimentId: string, ...fields }
 */

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { prisma } = await import("@/lib/prisma");
  const url = new URL(request.url);
  const experimentId = url.searchParams.get("experimentId");

  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }

  const landingPage = await prisma.adLabLandingPage.findUnique({
    where: { experimentId },
  });

  return NextResponse.json({ landingPage });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { experimentId } = body;

  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }

  try {
    const landingPage = await generateLandingPage(experimentId);
    return NextResponse.json({ landingPage });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Experiment not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { prisma } = await import("@/lib/prisma");
  const body = await request.json();
  const { experimentId, ...fields } = body;

  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }

  const existing = await prisma.adLabLandingPage.findUnique({
    where: { experimentId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Landing page not found" }, { status: 404 });
  }

  // Only allow updating known fields
  const allowedFields = [
    "heroHeadline", "heroSubheadline", "painPoints", "valuePropHeadline",
    "valueProps", "testimonialQuote", "testimonialName", "ctaText",
    "closingHeadline", "metaTitle", "metaDescription",
  ];
  const updateData: Record<string, any> = {};
  for (const key of allowedFields) {
    if (key in fields) updateData[key] = fields[key];
  }

  const landingPage = await prisma.adLabLandingPage.update({
    where: { experimentId },
    data: updateData,
  });

  return NextResponse.json({ landingPage });
}
