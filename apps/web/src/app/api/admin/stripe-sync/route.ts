/**
 * POST /api/admin/stripe-sync
 *
 * Queries Stripe for ALL customers + subscriptions and reconciles
 * with the local User table. Fixes any mismatches between DB status
 * and actual Stripe state.
 *
 * GET /api/admin/stripe-sync — returns last sync summary (if stored).
 *
 * Admin-only. Idempotent — safe to run repeatedly.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StripeSubStatus = "active" | "trialing" | "past_due" | "unpaid" | "canceled" | "incomplete" | "incomplete_expired" | "paused";

function mapSubscriptionStatus(s: string): string | null {
  if (s === "active" || s === "trialing") return "PRO";
  if (s === "past_due" || s === "unpaid") return "PAST_DUE";
  if (s === "canceled" || s === "incomplete_expired") return "FREE";
  return null;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { stripe } = await import("@/lib/stripe");
  const { prisma } = await import("@/lib/prisma");

  const synced: { email: string; dbStatus: string; stripeStatus: string; action: string }[] = [];
  const orphaned: { stripeId: string; email: string | null }[] = [];
  const errors: { email: string; error: string }[] = [];

  // Paginate through all Stripe customers
  for await (const customer of stripe.customers.list({ limit: 100 })) {
    const email = customer.email?.toLowerCase() ?? null;
    if (!email) {
      orphaned.push({ stripeId: customer.id, email: null });
      continue;
    }

    // Find matching user
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, subscriptionStatus: true, stripeCustomerId: true, stripeSubscriptionId: true },
    });

    if (!user) {
      orphaned.push({ stripeId: customer.id, email });
      continue;
    }

    // Get subscriptions for this customer
    const subs = await stripe.subscriptions.list({ customer: customer.id, limit: 10 });
    const activeSub = subs.data.find(s => s.status === "active" || s.status === "trialing")
      ?? subs.data.find(s => s.status === "past_due")
      ?? subs.data[0]; // fallback to most recent

    if (!activeSub) {
      // No subscriptions — ensure user has correct stripeCustomerId at least
      const update: Record<string, unknown> = {};
      if (user.stripeCustomerId !== customer.id) update.stripeCustomerId = customer.id;
      if (Object.keys(update).length > 0) {
        await prisma.user.update({ where: { id: user.id }, data: update });
      }
      synced.push({ email, dbStatus: user.subscriptionStatus, stripeStatus: "no_subscription", action: "linked_customer" });
      continue;
    }

    const expectedStatus = mapSubscriptionStatus(activeSub.status);
    if (!expectedStatus) {
      synced.push({ email, dbStatus: user.subscriptionStatus, stripeStatus: activeSub.status, action: "skipped_unmapped" });
      continue;
    }

    const periodEnd = activeSub.current_period_end
      ? new Date(activeSub.current_period_end * 1000)
      : null;

    const needsUpdate =
      user.subscriptionStatus !== expectedStatus ||
      user.stripeCustomerId !== customer.id ||
      user.stripeSubscriptionId !== activeSub.id;

    if (needsUpdate) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: expectedStatus,
            stripeCustomerId: customer.id,
            stripeSubscriptionId: activeSub.id,
            stripeCurrentPeriodEnd: periodEnd,
            subscriptionSource: "stripe",
          },
        });
        synced.push({
          email,
          dbStatus: user.subscriptionStatus,
          stripeStatus: `${activeSub.status} → ${expectedStatus}`,
          action: "updated",
        });
      } catch (err) {
        errors.push({ email, error: err instanceof Error ? err.message : String(err) });
      }
    } else {
      // Ensure period end is up to date
      if (periodEnd) {
        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCurrentPeriodEnd: periodEnd },
        }).catch(() => {});
      }
      synced.push({ email, dbStatus: user.subscriptionStatus, stripeStatus: activeSub.status, action: "already_current" });
    }
  }

  const syncedAt = new Date().toISOString();

  return NextResponse.json({
    syncedAt,
    synced,
    orphaned,
    errors,
    summary: {
      total: synced.length,
      updated: synced.filter(s => s.action === "updated").length,
      alreadyCurrent: synced.filter(s => s.action === "already_current").length,
      orphaned: orphaned.length,
      errors: errors.length,
    },
  });
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  return NextResponse.json({
    message: "Use POST to trigger a sync. Last sync data is returned in the POST response.",
  });
}
