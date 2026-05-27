/**
 * GET /api/onboarding/hook?creativeId=xxx or ?campaign=xxx
 *
 * Returns pain-specific funnel copy based on the ad creative or campaign.
 * Used to customize Screens 1, 8, 9, and 14 of the /start funnel.
 *
 * Returns: { headline, subheadline, bridge?, promise?, paywallHook? }
 * Falls back to null if no match (funnel uses defaults).
 *
 * Public endpoint — no auth required.
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
            select: {
              hypothesis: true,
              targetPersona: true,
              experiment: {
                select: {
                  topicBrief: true,
                  customPainHook: true,
                  customBridge: true,
                  customPromise: true,
                  customPaywallHook: true,
                },
              },
            },
          },
        },
      });

      if (creative) {
        const exp = creative.angle.experiment;
        return NextResponse.json({
          headline: tryParse(exp.customPainHook)?.headline || creative.headline,
          subheadline: tryParse(exp.customPainHook)?.subheadline || creative.primaryText.slice(0, 150),
          bridge: exp.customBridge || null,
          promise: exp.customPromise || null,
          paywallHook: exp.customPaywallHook || null,
        });
      }
    }

    // Fall back to campaign name match
    if (campaign) {
      const experiment = await prisma.adLabExperiment.findFirst({
        where: {
          OR: [
            { campaignName: { contains: campaign, mode: "insensitive" } },
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

      if (experiment) {
        const c = experiment.angles[0]?.creatives[0];
        return NextResponse.json({
          headline: tryParse(experiment.customPainHook)?.headline || c?.headline || null,
          subheadline: tryParse(experiment.customPainHook)?.subheadline || c?.primaryText?.slice(0, 150) || null,
          bridge: experiment.customBridge || null,
          promise: experiment.customPromise || null,
          paywallHook: experiment.customPaywallHook || null,
        });
      }
    }

    return NextResponse.json(null, { status: 200 });
  } catch (err) {
    console.error("[onboarding-hook] Error:", err);
    return NextResponse.json(null, { status: 200 });
  }
}

function tryParse(json: string | null | undefined): Record<string, string> | null {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}
