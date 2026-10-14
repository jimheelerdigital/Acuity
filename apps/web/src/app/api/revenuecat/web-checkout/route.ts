/**
 * GET /api/revenuecat/web-checkout?surface=funnel|upgrade
 *   → { appUserId, email, offeringId, tier }
 *
 * Config for opening RevenueCat Web Billing checkout in the browser
 * (lib/revenuecat/web-billing-client.ts). The RC app user id is always the
 * signed-in User.id — the same id the iOS/Android apps log in with — so a
 * web purchase unlocks Pro in the app with no extra linking.
 *
 * For `upgrade`, the 14-day-withdrawal acknowledgement must already be on
 * record (same gate as the old /api/stripe/checkout), because that surface
 * charges immediately.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { resolveWebCheckout, type WebCheckoutSurface } from "@/lib/revenuecat/web-billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("surface");
  const surface: WebCheckoutSurface | null =
    raw === "funnel" || raw === "upgrade" ? raw : null;
  if (!surface) return NextResponse.json({ error: "Bad surface" }, { status: 400 });

  if (surface === "upgrade") {
    const { hasRecentGrant } = await import("@/lib/consent");
    const ok = await hasRecentGrant(userId, "distance_contract_immediate_performance");
    if (!ok) {
      return NextResponse.json(
        { error: "ConsentRequired", requiresAcknowledgement: true },
        { status: 409 }
      );
    }
  }

  const config = await resolveWebCheckout(userId, surface);
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(config, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
