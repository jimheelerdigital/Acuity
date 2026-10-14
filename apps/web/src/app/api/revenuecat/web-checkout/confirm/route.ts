/**
 * POST /api/revenuecat/web-checkout/confirm → { paid: boolean }
 *
 * Called by the browser right after purchases-js resolves a purchase.
 * Server-side check against RevenueCat (not the client's word) before the
 * funnel fires "payment completed" analytics — the RC Web Billing
 * equivalent of /api/onboarding/verify-payment for Stripe sessions.
 *
 * Retries briefly: RC records the purchase before purchases-js resolves, but
 * a read can still race it by a moment.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { fetchRcSubscriber, rcHasProEntitlement } from "@/lib/revenuecat/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ATTEMPTS = 4;
const DELAY_MS = 750;

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  for (let i = 0; i < ATTEMPTS; i++) {
    const rc = await fetchRcSubscriber(userId);
    if (rc.ok && rcHasProEntitlement(rc.subscriber)) {
      return NextResponse.json({ paid: true });
    }
    if (i < ATTEMPTS - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  return NextResponse.json({ paid: false });
}
