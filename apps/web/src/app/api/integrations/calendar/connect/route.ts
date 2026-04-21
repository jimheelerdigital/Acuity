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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gated = await gateFeatureFlag(userId, "calendar_integrations");
  if (gated) return gated;

  return NextResponse.json(
    {
      error: "Calendar integrations are not yet available.",
      hint: "Coming after the beta freeze. See docs/CALENDAR_INTEGRATION_PLAN.md for the rollout plan.",
    },
    { status: 501 }
  );
}
