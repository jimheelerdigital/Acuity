/**
 * /api/user/product-analytics
 *
 * GET  — returns the user's current product-analytics opt-out state:
 *          { enabled: boolean }. Defaults true. 401 if unauthenticated.
 * POST — updates it. Body: { enabled: boolean }.
 *
 * Backs the in-app Settings → Privacy → "Product analytics" toggle
 * (v1.4 GDPR slice). The preference is enforced server-side in
 * /api/onboarding-events, which drops post-auth events when this is
 * false. Anonymous pre-signup funnel events are NOT affected (legitimate
 * interest, ad attribution).
 *
 * Auth: unified web-cookie / mobile-bearer via getAnySessionUserId.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { productAnalyticsEnabled: true },
  });
  return NextResponse.json({ enabled: u?.productAnalyticsEnabled ?? true });
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    enabled?: unknown;
  } | null;
  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "InvalidBody" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({
    where: { id: userId },
    data: { productAnalyticsEnabled: body.enabled },
  });

  return NextResponse.json({ ok: true, enabled: body.enabled });
}
