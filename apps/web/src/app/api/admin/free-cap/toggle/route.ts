/**
 * POST /api/admin/free-cap/toggle
 *
 * Manual flip for the `free_recording_cap` feature flag. Writes a
 * matching FreeCapAuditLog row (MANUAL_ENABLED | MANUAL_DISABLED)
 * AND a generic AdminAuditLog row so the Overview panel surfaces it.
 *
 * Body: { enabled: boolean; notes?: string }
 *
 * The free-cap-evaluator cron is sticky-on — it never auto-disables.
 * Manual disable through this endpoint is the only off-path. The
 * cron also won't re-flip while enabled is true (its own short-
 * circuit), so a manual disable will hold until a fresh 7-cycle
 * window of all-conditions-met re-triggers AUTO_ENABLED.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ADMIN_ACTIONS, logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-guard";
import { resetFeatureFlagCache } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FLAG_KEY = "free_recording_cap";

const Body = z.object({
  enabled: z.boolean(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parse = Body.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parse.error.flatten() },
      { status: 400 }
    );
  }
  const { enabled, notes } = parse.data;

  const flag = await prisma.featureFlag.findUnique({
    where: { key: FLAG_KEY },
  });
  if (!flag) {
    return NextResponse.json(
      { error: "free_recording_cap flag not seeded — run scripts/seed-feature-flags.ts" },
      { status: 404 }
    );
  }

  if (flag.enabled === enabled) {
    return NextResponse.json(
      {
        error: `Flag already ${enabled ? "enabled" : "disabled"} — nothing to do`,
      },
      { status: 409 }
    );
  }

  const action = enabled ? "MANUAL_ENABLED" : "MANUAL_DISABLED";

  const [updated] = await prisma.$transaction([
    prisma.featureFlag.update({
      where: { id: flag.id },
      data: { enabled, rolloutPercentage: 100 },
    }),
    prisma.freeCapAuditLog.create({
      data: {
        action,
        triggeringEvaluationIds: [],
        notes: notes ?? null,
      },
    }),
  ]);

  resetFeatureFlagCache();

  await logAdminAction({
    adminUserId: guard.adminUserId,
    action: ADMIN_ACTIONS.FREE_CAP_MANUAL_TOGGLE,
    metadata: {
      flagKey: FLAG_KEY,
      before: { enabled: flag.enabled },
      after: { enabled: updated.enabled },
      capAction: action,
      notes: notes ?? null,
    },
  });

  return NextResponse.json({ flag: updated, capAction: action });
}
