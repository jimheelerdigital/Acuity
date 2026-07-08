/**
 * GET  /api/admin/users/[id]/cancel-subscription  — read-only preview
 * POST /api/admin/users/[id]/cancel-subscription  — execute cancel + refund
 *
 * The permanent admin equivalent of the Layer 1 operator script
 * (scripts/cancel-customer-subscription.ts). Same safety guarantees:
 *   - preview is read-only (no money moved),
 *   - execute requires a typed-email confirmation in the body,
 *   - only the un-refunded portion of succeeded charges is refunded,
 *   - the subscription is canceled immediately, and
 *   - the DB row is reconciled (webhook, else manually).
 *
 * Admin-gated (User.isAdmin) and rate-limited. Apple / Google Play
 * subscriptions are blocked — those can only be canceled in their stores.
 * Every execute writes an AdminAuditLog row.
 *
 * In production STRIPE_SECRET_KEY (Vercel env) is the LIVE key, so this uses
 * the shared `@/lib/stripe`. Locally it operates on test mode.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ADMIN_ACTIONS, logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-guard";
import {
  executeCancelAndRefund,
  previewCancel,
} from "@/lib/billing/cancel-and-refund";
import { prisma } from "@/lib/prisma";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Eligibility =
  | { ok: true; customerId: string; subscriptionId: string | null }
  | { ok: false; reason: "no_stripe_customer" | "not_applicable"; subscriptionSource: string | null };

type TargetUser = {
  id: string;
  email: string;
  subscriptionStatus: string;
  subscriptionSource: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

const STORE_SOURCES = new Set(["apple", "google_play"]);

function assessEligibility(user: TargetUser): Eligibility {
  // Store-managed subs can't be canceled/refunded via Stripe.
  if (user.subscriptionSource && STORE_SOURCES.has(user.subscriptionSource)) {
    return { ok: false, reason: "not_applicable", subscriptionSource: user.subscriptionSource };
  }
  if (!user.stripeCustomerId) {
    return { ok: false, reason: "no_stripe_customer", subscriptionSource: user.subscriptionSource };
  }
  // Stripe or legacy null source with a customer id → cancellable. A missing
  // subscriptionId is allowed (charges may still be refundable).
  return { ok: true, customerId: user.stripeCustomerId, subscriptionId: user.stripeSubscriptionId };
}

async function loadTarget(id: string): Promise<TargetUser | null> {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      subscriptionStatus: true,
      subscriptionSource: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const user = await loadTarget(params.id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const eligibility = assessEligibility(user);
  if (!eligibility.ok) {
    return NextResponse.json({
      eligible: false,
      reason: eligibility.reason,
      subscriptionSource: eligibility.subscriptionSource,
      email: user.email,
      subscriptionStatus: user.subscriptionStatus,
    });
  }

  const preview = await previewCancel(stripe, {
    customerId: eligibility.customerId,
    subscriptionId: eligibility.subscriptionId,
  });

  return NextResponse.json({
    eligible: true,
    email: user.email,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionSource: user.subscriptionSource,
    preview,
  });
}

const Body = z.object({
  confirmEmail: z.string().min(1).max(320),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const limited = await enforceUserRateLimit("userWrite", guard.adminUserId);
  if (limited) return limited;

  const parse = Body.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parse.error.flatten() },
      { status: 400 }
    );
  }

  const user = await loadTarget(params.id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Typed-email confirmation (defense-in-depth for a money action).
  if (parse.data.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Confirmation email did not match." },
      { status: 400 }
    );
  }

  const eligibility = assessEligibility(user);
  if (!eligibility.ok) {
    return NextResponse.json(
      { error: "Subscription is not cancellable here", reason: eligibility.reason },
      { status: 400 }
    );
  }

  let result;
  try {
    result = await executeCancelAndRefund(stripe, prisma, {
      userId: user.id,
      customerId: eligibility.customerId,
      subscriptionId: eligibility.subscriptionId,
    });
  } catch (err) {
    console.error("[admin/cancel-subscription] execute failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cancel failed" },
      { status: 500 }
    );
  }

  await logAdminAction({
    adminUserId: guard.adminUserId,
    action: ADMIN_ACTIONS.USER_CANCEL_SUBSCRIPTION,
    targetUserId: user.id,
    metadata: {
      subscriptionId: eligibility.subscriptionId,
      canceledStatus: result.canceledStatus,
      cancelError: result.cancelError,
      refunds: result.refunds.map((r) => ({
        chargeId: r.chargeId,
        refundId: r.refundId,
        amountCents: r.amountCents,
      })),
      totalRefundedCents: result.totalRefundedCents,
      dbVia: result.dbVia,
      previousStatus: user.subscriptionStatus,
    },
  });

  return NextResponse.json({ ok: true, result });
}
