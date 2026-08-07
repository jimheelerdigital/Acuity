/**
 * POST /api/admin/comp   { "email": "tester@example.com" }
 *
 * The one-line comp action: grant an account a durable complimentary PRO —
 * `subscriptionStatus = "PRO"`, `subscriptionSource = "comp"`. Comp accounts get
 * full PRO access (entitlements read status only), hide "Manage subscription"
 * (no Stripe customer), are excluded from the drift monitor, and are never
 * demoted by any cross-source demoter or the reconciler. Idempotent.
 *
 * Auth: CRON_SECRET bearer OR admin session (mirrors the other admin routes).
 */

import { NextRequest, NextResponse } from "next/server";

import { COMP_SUBSCRIPTION_SOURCE } from "@/lib/entitlements";
import { ADMIN_ACTIONS, logAdminAction } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!hasCronAuth) {
    try {
      const { requireAdmin } = await import("@/lib/admin-guard");
      const guard = await requireAdmin();
      if (!guard.ok) return guard.response;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, subscriptionStatus: true, subscriptionSource: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found", email }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: "PRO",
      subscriptionSource: COMP_SUBSCRIPTION_SOURCE,
      // Clean PRO — a comp bypasses the trial clock and any stale dunning anchor.
      trialEndsAt: null,
      stripeFirstFailureAt: null,
    },
  });

  await logAdminAction({
    adminUserId: "system:comp",
    action: ADMIN_ACTIONS.USER_COMP,
    targetUserId: user.id,
    metadata: {
      email,
      from: `${user.subscriptionStatus}/${user.subscriptionSource ?? "null"}`,
      to: `PRO/${COMP_SUBSCRIPTION_SOURCE}`,
    },
  });

  return NextResponse.json({
    ok: true,
    email,
    comped: true,
    was: `${user.subscriptionStatus}/${user.subscriptionSource ?? "null"}`,
  });
}
