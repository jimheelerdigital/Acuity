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
import { cancelSubscriptionOnDelete } from "@/lib/cancel-subscription-on-delete";
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
      subscriptionSource: true,
      trialEndsAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeCurrentPeriodEnd: true,
      isAdmin: true,
      devicePlatform: true,
      appVersion: true,
      appFirstOpenedAt: true,
      firstRecordingAt: true,
      signupUtmSource: true,
      signupUtmMedium: true,
      signupUtmCampaign: true,
      signupUtmContent: true,
      signupUtmTerm: true,
      signupReferrer: true,
      signupLandingPath: true,
      onboarding: { select: { completedAt: true, currentStep: true } },
      _count: { select: { entries: { where: { status: "COMPLETE" } } } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // One extra query: most recent entry timestamp (not content).
  // Restricted to `createdAt` — never summary/transcript/audio.
  const latestEntry = await prisma.entry.findFirst({
    where: { userId: params.id, status: "COMPLETE" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  // First weekly report timestamp for the milestone timeline.
  const firstWeeklyReport = await prisma.weeklyReport.findFirst({
    where: { userId: params.id, status: "COMPLETE" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const overrides = await prisma.userFeatureOverride.findMany({
    where: { userId: params.id },
    orderBy: { flagKey: "asc" },
  });

  // Onboarding funnel events for the detail timeline
  let onboardingEvents: { event: string; createdAt: Date }[] = [];
  try {
    onboardingEvents = await prisma.onboardingEvent.findMany({
      where: { userId: params.id, isBot: false },
      select: { event: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  } catch {
    // Table may not exist yet
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionSource: user.subscriptionSource,
      trialEndsAt: user.trialEndsAt,
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd,
      isAdmin: user.isAdmin,
      entryCount: user._count.entries,
      latestEntryAt: latestEntry?.createdAt ?? null,
      // Device info
      devicePlatform: user.devicePlatform,
      appVersion: user.appVersion,
      appFirstOpenedAt: user.appFirstOpenedAt,
      // Journey milestones
      onboardingCompletedAt: user.onboarding?.completedAt ?? null,
      onboardingStep: user.onboarding?.currentStep ?? null,
      firstRecordingAt: user.firstRecordingAt,
      firstWeeklyReportAt: firstWeeklyReport?.createdAt ?? null,
      // Onboarding funnel events
      onboardingEvents: onboardingEvents.map((e) => ({
        event: e.event,
        createdAt: e.createdAt,
      })),
      // Attribution
      signupUtmSource: user.signupUtmSource,
      signupUtmMedium: user.signupUtmMedium,
      signupUtmCampaign: user.signupUtmCampaign,
      signupUtmContent: user.signupUtmContent,
      signupUtmTerm: user.signupUtmTerm,
      signupReferrer: user.signupReferrer,
      signupLandingPath: user.signupLandingPath,
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
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      subscriptionSource: true,
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

  // Cancel any active subscription before the purge (incident 2026-06-13 —
  // same source-aware, id→customer→email resolution as the self-delete path).
  const stripeCancellationStatus = await cancelSubscriptionOnDelete(stripe, {
    email: target.email,
    subscriptionStatus: target.subscriptionStatus,
    subscriptionSource: target.subscriptionSource,
    stripeSubscriptionId: target.stripeSubscriptionId,
    stripeCustomerId: target.stripeCustomerId,
  });

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
          subscriptionSource: target.subscriptionSource ?? null,
          stripeSubscriptionId: target.stripeSubscriptionId ?? null,
          stripeCancellationStatus,
        },
        update: {
          deletedAt: new Date(),
          originalCreatedAt: target.createdAt,
          originalTrialEndedAt: target.trialEndsAt ?? null,
          subscriptionSource: target.subscriptionSource ?? null,
          stripeSubscriptionId: target.stripeSubscriptionId ?? null,
          stripeCancellationStatus,
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
