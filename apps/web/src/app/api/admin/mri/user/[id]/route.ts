// MRI Diagnostic Dashboard — per-user diagnostic timeline.
//
//   GET /api/admin/mri/user/[id]
//
// Resolves the user and returns a merged, descending timeline of
// OnboardingEvents, Entries, TrialEmailLog, ClaudeCallLog, and RedFlags (where
// the user is in affectedUserIds). Admin-gated; every lookup is recorded via
// logAdminAction (who looked up whom). Read-only except the audit write.

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";
import { getUserTimeline } from "@/lib/mri/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = params;

  const timeline = await getUserTimeline(prisma, id);
  if (!timeline) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Record the lookup (who looked up whom) — non-fatal if it fails.
  await logAdminAction({
    adminUserId: guard.adminUserId,
    action: ADMIN_ACTIONS.METRIC_DRILLDOWN,
    targetUserId: id,
    metadata: { surface: "mri.user_lookup", email: timeline.user.email },
  });

  return NextResponse.json(timeline);
}
