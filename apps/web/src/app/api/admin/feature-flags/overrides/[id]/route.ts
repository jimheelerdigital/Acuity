import { NextRequest, NextResponse } from "next/server";

import { ADMIN_ACTIONS, logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-guard";
import { resetFeatureFlagCache } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const existing = await prisma.userFeatureOverride.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.userFeatureOverride.delete({ where: { id: params.id } });
  resetFeatureFlagCache();

  await logAdminAction({
    adminUserId: guard.adminUserId,
    action: ADMIN_ACTIONS.FEATURE_OVERRIDE_DELETE,
    targetUserId: existing.userId,
    metadata: {
      flagKey: existing.flagKey,
      previousEnabled: existing.enabled,
      reason: existing.reason,
    },
  });

  return NextResponse.json({ ok: true });
}
