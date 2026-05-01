/**
 * POST /api/integrations/calendar/connect
 *
 * Stub endpoint. The real OAuth start path (Google → Outlook →
 * Apple) ships post-beta — see docs/CALENDAR_INTEGRATION_PLAN.md.
 * Returns 501 with a clear reason so the client can show a proper
 * "Coming soon" state instead of a misleading error toast.
 *
 * Kept here rather than behind a feature flag so the path reserves
 * its URL shape; when the real handler lands the replacement is a
 * drop-in without a client-side fetch URL change.
 */

import { NextRequest, NextResponse } from "next/server";

import { gateFeatureFlag } from "@/lib/feature-flags";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Tier gate (v1.1 slice C1): PRO + TRIAL + PAST_DUE only. FREE /
  // post-trial-free returns 402 SUBSCRIPTION_REQUIRED so the upgrade
  // CTA is the right surface, not the 501 "Coming soon" stub. Runs
  // before the feature-flag gate so eligible users on a flag-off
  // build still see the right copy.
  const gated = await requireEntitlement("canSyncCalendar", userId);
  if (!gated.ok) return gated.response;

  const flagGated = await gateFeatureFlag(userId, "calendar_integrations");
  if (flagGated) return flagGated;

  return NextResponse.json(
    {
      error: "Calendar integrations are not yet available.",
      hint: "Coming after the beta freeze. See docs/CALENDAR_INTEGRATION_PLAN.md for the rollout plan.",
    },
    { status: 501 }
  );
}
