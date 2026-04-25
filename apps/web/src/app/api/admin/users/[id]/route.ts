/**
 * GET /api/admin/users/[id] — metadata-only detail.
 *
 * NEVER returns entry content, transcripts, goals, tasks, AI
 * observations, or audio URLs. Only counts + timestamps + plan.
 *
 * DELETE /api/admin/users/[id] — admin-initiated account removal.
 * Mirrors /api/user/delete but bypasses the confirmEmail gate (the
 * admin UI gates with its own modal). Writes DeletedUser tombstone
 * + cascades via FK. Logs to AdminAuditLog.
 */

import { NextRequest, NextResponse } from "next/server";

import { ADMIN_ACTIONS, logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STORAGE_BUCKET = "voice-entries";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      email: true,
      createdAt: true,
      lastSeenAt: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeCurrentPeriodEnd: true,
      isAdmin: true,
      _count: { select: { entries: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // One extra query: most recent entry timestamp (not content).
  // Restricted to `createdAt` — never summary/transcript/audio.
  const latestEntry = await prisma.entry.findFirst({
    where: { userId: params.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const overrides = await prisma.userFeatureOverride.findMany({
    where: { userId: params.id },
    orderBy: { flagKey: "asc" },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      subscriptionStatus: user.subscriptionStatus,
      trialEndsAt: user.trialEndsAt,
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd,
      isAdmin: user.isAdmin,
      entryCount: user._count.entries,
      latestEntryAt: latestEntry?.createdAt ?? null,
    },
    overrides,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      email: true,
      createdAt: true,
      trialEndsAt: true,
      stripeCustomerId: true,
    },
  });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Safety: don't let an admin nuke themselves from the UI.
  if (target.id === guard.adminUserId) {
    return NextResponse.json(
      { error: "Refusing to delete your own admin account from the admin UI." },
      { status: 400 }
    );
  }

  if (target.stripeCustomerId) {
    try {
      await stripe.customers.del(target.stripeCustomerId);
    } catch (err) {
      console.error("[admin/users.delete] Stripe cancel failed (proceeding):", err);
    }
  }

  try {
    const { canonicalizeEmail } = await import("@/lib/bootstrap-user");
    const normalizedEmail = canonicalizeEmail(target.email);
    await prisma.$transaction(async (tx) => {
      await tx.deletedUser.upsert({
        where: { email: normalizedEmail },
        create: {
          email: normalizedEmail,
          originalCreatedAt: target.createdAt,
          originalTrialEndedAt: target.trialEndsAt ?? null,
        },
        update: {
          deletedAt: new Date(),
          originalCreatedAt: target.createdAt,
          originalTrialEndedAt: target.trialEndsAt ?? null,
        },
      });
      await tx.verificationToken.deleteMany({
        where: { identifier: target.email },
      });
      await tx.user.delete({ where: { id: target.id } });
    });
  } catch (err) {
    console.error("[admin/users.delete] DB delete failed:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  // Best-effort storage cleanup — same pattern as user-self-delete.
  try {
    const prefix = target.id;
    for (let offset = 0; ; offset += 100) {
      const { data: objs } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(prefix, { limit: 100, offset });
      if (!objs || objs.length === 0) break;
      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(objs.map((o) => `${prefix}/${o.name}`));
      if (objs.length < 100) break;
    }
  } catch (err) {
    console.error("[admin/users.delete] Storage cleanup failed:", err);
  }

  await logAdminAction({
    adminUserId: guard.adminUserId,
    action: ADMIN_ACTIONS.USER_SOFT_DELETE,
    targetUserId: target.id,
    metadata: {
      emailHash: hashEmail(target.email),
      hadStripeCustomer: Boolean(target.stripeCustomerId),
    },
  });

  return NextResponse.json({ deleted: true });
}

function hashEmail(email: string): string {
  // Email is lightly obfuscated in the audit log so the log row
  // doesn't carry plaintext PII of the deleted user.
  const crypto = require("crypto") as typeof import("crypto");
  return crypto
    .createHash("sha256")
    .update(email.toLowerCase())
    .digest("hex")
    .slice(0, 12);
}
