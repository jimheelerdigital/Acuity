import "server-only";

import { NextResponse } from "next/server";

import { entitlementsFor, type Entitlement } from "@/lib/entitlements";
import { safeLog } from "@/lib/safe-log";

/**
 * Shared helper for the four write endpoints gated by entitlements
 * (IMPLEMENTATION_PLAN_PAYWALL §1.3): /api/record,
 * /api/weekly, /api/lifemap/refresh, /api/life-audit.
 *
 * Usage at a route:
 *   const gate = await requireEntitlement("canRecord", userId);
 *   if (!gate.ok) return gate.response;
 *   // proceed with the work
 *
 * Returns a typed discriminated union so TypeScript narrows correctly
 * on the subsequent code path.
 */

export type PaywallGate =
  | { ok: true; entitlement: Entitlement }
  | { ok: false; response: NextResponse };

export async function requireEntitlement(
  flag: keyof Pick<
    Entitlement,
    | "canRecord"
    | "canExtractEntries"
    | "canGenerateNewWeeklyReport"
    | "canGenerateNewLifeAudit"
    | "canGenerateMonthlyMemoir"
    | "canRefreshLifeMap"
  >,
  userId: string
): Promise<PaywallGate> {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  });

  if (!user) {
    // Stale session — no row to evaluate against. Soft-lock with
    // the same shape as a paywall rejection so the client handles it
    // consistently.
    safeLog.warn("paywall.user_missing", { userId, flag });
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "SUBSCRIPTION_REQUIRED",
          message: "Your session is stale. Please sign in again.",
          redirect: "/auth/signin",
        },
        { status: 402 }
      ),
    };
  }

  const entitlement = entitlementsFor(user);
  if (entitlement[flag]) {
    return { ok: true, entitlement };
  }

  safeLog.info("paywall.reject", {
    userId,
    flag,
    subscriptionStatus: user.subscriptionStatus,
    isPostTrialFree: entitlement.isPostTrialFree,
  });

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "SUBSCRIPTION_REQUIRED",
        message:
          "Your trial has ended. Continue the journey at /upgrade",
        redirect: "/upgrade?src=paywall_redirect",
      },
      { status: 402 }
    ),
  };
}
