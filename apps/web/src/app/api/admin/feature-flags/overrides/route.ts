/**
 * User-scoped feature-flag overrides.
 *
 * GET  ?email=foo@bar.com  → resolve user + return their overrides
 * POST                     → upsert { userId, flagKey, enabled, reason }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ADMIN_ACTIONS, logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-guard";
import { resetFeatureFlagCache } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      createdAt: true,
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const overrides = await prisma.userFeatureOverride.findMany({
    where: { userId: user.id },
    orderBy: { flagKey: "asc" },
  });

  return NextResponse.json({ user, overrides });
}

const PostBody = z.object({
  userId: z.string().min(1),
  flagKey: z.string().min(1).max(64),
  enabled: z.boolean(),
  reason: z.string().min(3).max(500),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parse = PostBody.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parse.error.flatten() },
      { status: 400 }
    );
  }
  const { userId, flagKey, enabled, reason } = parse.data;

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const row = await prisma.userFeatureOverride.upsert({
    where: { userId_flagKey: { userId, flagKey } },
    create: { userId, flagKey, enabled, reason },
    update: { enabled, reason },
  });

  resetFeatureFlagCache();

  await logAdminAction({
    adminUserId: guard.adminUserId,
    action: ADMIN_ACTIONS.FEATURE_OVERRIDE_UPSERT,
    targetUserId: userId,
    metadata: { flagKey, enabled, reason },
  });

  return NextResponse.json({ override: row });
}
