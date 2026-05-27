/**
 * GET /api/onboarding/hook?creativeId=xxx or ?campaign=xxx
 *
 * Returns dynamic pain hook copy based on the ad creative or campaign that
 * brought the user to /start. If a matching AdLab creative or experiment
 * exists, returns the angle's headline + hypothesis as the hook. Falls back
 * to null if no match found (the funnel uses its default hook).
 *
 * Public endpoint — no auth required (called from /start before signup).
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const creativeId = sp.get("creativeId");
  const campaign = sp.get("campaign");

  if (!creativeId && !campaign) {
    return NextResponse.json(null, { status: 200 });
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    // Try by creative ID first (utm_content maps to creative.id)
    if (creativeId) {
      const creative = await prisma.adLabCreative.findUnique({
        where: { id: creativeId },
        select: {
          headline: true,
          primaryText: true,
          angle: {
            select: { hypothesis: true, targetPersona: true },
          },
        },
      });

      if (creative) {
        return NextResponse.json({
          headline: creative.headline,
          subheadline: creative.primaryText.slice(0, 150),
        });
      }
    }

    // Fall back to campaign name match (utm_campaign)
    if (campaign) {
      // Campaign name might match experiment topicBrief or campaignName
      const experiment = await prisma.adLabExperiment.findFirst({
        where: {
          OR: [
            { topicBrief: { contains: campaign, mode: "insensitive" } },
          ],
        },
        include: {
          angles: {
            where: { advanced: true },
            take: 1,
            orderBy: { score: "desc" },
            include: { creatives: { take: 1 } },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (experiment?.angles[0]?.creatives[0]) {
        const c = experiment.angles[0].creatives[0];
        return NextResponse.json({
          headline: c.headline,
          subheadline: c.primaryText.slice(0, 150),
        });
      }
    }

    return NextResponse.json(null, { status: 200 });
  } catch (err) {
    console.error("[onboarding-hook] Error:", err);
    return NextResponse.json(null, { status: 200 }); // Never block the funnel
  }
}
