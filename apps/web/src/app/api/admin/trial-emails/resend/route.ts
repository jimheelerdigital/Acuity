/**
 * POST /api/admin/trial-emails/resend
 *
 * Admin-only. Re-dispatches a specific trial email to a specific
 * user, bypassing the (userId, emailKey) dedupe via force=true.
 * Used from the admin "Trial Emails" tab for debugging / manual
 * sends.
 *
 * Body: { userId: string, emailKey: TrialEmailKey }
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import type { TrialEmailKey } from "@/emails/trial/registry";
import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KNOWN_KEYS: TrialEmailKey[] = [
  "welcome_day0",
  "first_debrief_replay",
  "objection_60sec",
  "pattern_tease",
  "user_story",
  "weekly_report_checkin",
  "life_matrix_reveal",
  "value_recap",
  "trial_ending_day13",
  "reactivation_friction",
  "reactivation_social",
  "reactivation_final",
  "power_deepen",
  "power_referral_tease",
];

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { userId?: unknown; emailKey?: unknown }
    | null;
  const userId =
    typeof body?.userId === "string" && body.userId.trim()
      ? body.userId.trim()
      : "";
  const emailKey =
    typeof body?.emailKey === "string" ? body.emailKey.trim() : "";

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  if (!KNOWN_KEYS.includes(emailKey as TrialEmailKey)) {
    return NextResponse.json({ error: "Unknown emailKey" }, { status: 400 });
  }

  const { sendTrialEmail } = await import("@/lib/trial-emails");
  const result = await sendTrialEmail(userId, emailKey as TrialEmailKey, {
    force: true,
  });

  return NextResponse.json(result);
}
