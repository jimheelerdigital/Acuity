import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ADMIN_ACTIONS, logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-guard";
import { resetFeatureFlagCache } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PatchBody = z.object({
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
  requiredTier: z.enum(["FREE", "PRO"]).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parse = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parse.error.flatten() },
      { status: 400 }
    );
  }
  const body = parse.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const before = await prisma.featureFlag.findUnique({
    where: { id: params.id },
  });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const after = await prisma.featureFlag.update({
    where: { id: params.id },
    data: {
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.rolloutPercentage !== undefined
        ? { rolloutPercentage: body.rolloutPercentage }
        : {}),
      ...(body.requiredTier !== undefined
        ? { requiredTier: body.requiredTier }
        : {}),
    },
  });

  // Invalidate the per-request cache. Other in-flight requests may still
  // see the old value (cache is process-local), but the next /api/*
  // call in any serverless function warms a fresh cache.
  resetFeatureFlagCache();

  // Pick the action slug that most closely matches what changed — for
  // multi-field PATCHes, pick the most impactful (toggle > tier > rollout).
  let action: string = ADMIN_ACTIONS.FEATURE_FLAG_ROLLOUT;
  if (body.enabled !== undefined) action = ADMIN_ACTIONS.FEATURE_FLAG_TOGGLE;
  else if (body.requiredTier !== undefined) action = ADMIN_ACTIONS.FEATURE_FLAG_TIER;

  await logAdminAction({
    adminUserId: guard.adminUserId,
    action,
    metadata: {
      flagKey: after.key,
      before: {
        enabled: before.enabled,
        rolloutPercentage: before.rolloutPercentage,
        requiredTier: before.requiredTier,
      },
      after: {
        enabled: after.enabled,
        rolloutPercentage: after.rolloutPercentage,
        requiredTier: after.requiredTier,
      },
    },
  });

  return NextResponse.json({ flag: after });
}
