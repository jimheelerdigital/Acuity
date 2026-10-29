/**
 * GET /api/creators/connect — send the creator to Stripe: hosted Express
 * onboarding until payouts are enabled, then their Express dashboard.
 * Also the onboarding `refresh_url` (?refresh=1) when a link expires.
 */
import { NextRequest, NextResponse } from "next/server";

import { connectCountry } from "@/lib/creators/config";
import { connectDashboardLink, connectOnboardingLink, refreshConnectStatus } from "@/lib/creators/payouts";
import { currentCreatorId } from "@/lib/creators/session";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const creatorId = await currentCreatorId();
  if (!creatorId) return NextResponse.redirect(new URL("/creators", req.url));
  try {
    const ready = await refreshConnectStatus(creatorId);
    const country = connectCountry(req.nextUrl.searchParams.get("country"));
    const url = ready ? await connectDashboardLink(creatorId) : await connectOnboardingLink(creatorId, country);
    if (!url) throw new Error("no Stripe link");
    return NextResponse.redirect(url);
  } catch (err) {
    safeLog.error("creators.connect.failed", err, { creatorId });
    return NextResponse.redirect(new URL("/creators?connect_error=1", req.url));
  }
}
