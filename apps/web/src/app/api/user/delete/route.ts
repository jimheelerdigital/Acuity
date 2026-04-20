/**
 * POST /api/user/delete
 *
 * Permanently deletes the signed-in user's account and all associated
 * data. Required for SECURITY_AUDIT.md S3 / GDPR Art. 17 compliance.
 *
 * Confirmation: the request body must include `{ confirmEmail: <email> }`
 * matching the session's email exactly. Defense-in-depth — the UI
 * already enforces this; the route enforces it again so no malicious
 * client can bypass the modal by hand-crafting a fetch.
 *
 * Order of operations:
 *   1. Stripe customer cancellation (best-effort — failures logged
 *      but proceed; Stripe orphan = ops debt, not a user-facing
 *      privacy issue).
 *   2. Delete VerificationToken rows by email (NextAuth tokens are
 *      keyed on identifier, no FK to User).
 *   3. Delete the User row in a transaction. Cascades drop Account,
 *      Session, Entry, Task, Goal, WeeklyReport, LifeMapArea,
 *      UserMemory automatically (schema FK constraints).
 *   4. Storage cleanup: list + delete every object under
 *      `voice-entries/${userId}/` (best-effort — failures logged
 *      but the user's identity is already gone).
 *
 * Returns 200 { deleted: true } on success.
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STORAGE_BUCKET = "voice-entries";

export async function POST(req: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const sessionEmail = session.user.email;

  // ── 1b. Rate limit (3 attempts per day per user) ────────────────────────
  const rl = await checkRateLimit(limiters.accountDelete, `user:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  // ── 2. Body validation ───────────────────────────────────────────────────
  const body = await req.json().catch(() => null);
  const confirmEmail = (body?.confirmEmail ?? "").trim().toLowerCase();
  if (!confirmEmail || confirmEmail !== sessionEmail.toLowerCase()) {
    return NextResponse.json(
      {
        error:
          "Confirmation email does not match the signed-in account",
      },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  // Re-fetch user — we need the stripeCustomerId, and also confirm the
  // session.user.id is still a real row (defensive against stale JWTs).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      stripeCustomerId: true,
      createdAt: true,
      trialEndsAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (user.email.toLowerCase() !== sessionEmail.toLowerCase()) {
    // JWT email is stale (e.g. user changed email then session re-issued).
    // Refuse rather than risk deleting the wrong row.
    return NextResponse.json(
      { error: "Session email no longer matches the account" },
      { status: 409 }
    );
  }

  // ── 3. Stripe cancellation (best-effort) ────────────────────────────────
  // Deleting the Stripe customer also cancels any active subscription,
  // per Stripe docs. We log + proceed on failure rather than blocking
  // the privacy delete.
  if (user.stripeCustomerId) {
    try {
      await stripe.customers.del(user.stripeCustomerId);
    } catch (err) {
      console.error(
        `[user/delete] Stripe customer ${user.stripeCustomerId} cancellation failed (proceeding):`,
        err
      );
    }
  }

  // ── 4. DB delete (transactional) ────────────────────────────────────────
  // VerificationToken has no FK to User — it's keyed on identifier (email)
  // and is NextAuth-managed. Hand-clean those.
  // The User row delete cascades everything else via the schema's
  // onDelete: Cascade FK constraints.
  //
  // DeletedUser tombstone (pentest T-07 fix): write the tombstone
  // BEFORE the cascade inside the same transaction so a subsequent
  // re-signup with the same email sees it and bootstrapNewUser picks
  // the reduced-trial path via trialDaysForEmail. Upsert rather than
  // create because the same email may have been deleted + restored +
  // re-deleted — we just want the latest record.
  try {
    const normalizedEmail = user.email.toLowerCase().trim();
    await prisma.$transaction(async (tx) => {
      await tx.deletedUser.upsert({
        where: { email: normalizedEmail },
        create: {
          email: normalizedEmail,
          originalCreatedAt: user.createdAt,
          originalTrialEndedAt: user.trialEndsAt ?? null,
        },
        update: {
          deletedAt: new Date(),
          originalCreatedAt: user.createdAt,
          originalTrialEndedAt: user.trialEndsAt ?? null,
        },
      });
      await tx.verificationToken.deleteMany({
        where: { identifier: user.email },
      });
      await tx.user.delete({ where: { id: userId } });
    });
  } catch (err) {
    console.error(`[user/delete] DB delete failed for user ${userId}:`, err);
    return NextResponse.json(
      { error: "Account deletion failed — please try again or contact support" },
      { status: 500 }
    );
  }

  // ── 5. Storage cleanup (best-effort) ────────────────────────────────────
  // The user's row is gone — privacy obligation met. Audio files in
  // Supabase Storage are dangling at this point; clean them up but log
  // and accept failure (orphans become ops debt, not user-visible).
  try {
    const prefix = `${userId}`;
    let removedCount = 0;
    // The Supabase JS SDK paginates list() at 100 by default; iterate
    // in case a single user accumulated more than 100 audio files.
    for (let offset = 0; ; offset += 100) {
      const { data: objects, error: listErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(prefix, { limit: 100, offset });
      if (listErr) {
        console.error(
          `[user/delete] Storage list failed for ${prefix} (orphaned):`,
          listErr
        );
        break;
      }
      if (!objects || objects.length === 0) break;
      const paths = objects.map((o) => `${prefix}/${o.name}`);
      const { error: rmErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(paths);
      if (rmErr) {
        console.error(
          `[user/delete] Storage remove failed for ${prefix} (orphaned):`,
          rmErr
        );
        break;
      }
      removedCount += paths.length;
      if (objects.length < 100) break;
    }
    if (removedCount > 0) {
      console.log(
        `[user/delete] Removed ${removedCount} storage object(s) for ${userId}`
      );
    }
  } catch (err) {
    console.error(
      `[user/delete] Storage cleanup threw for ${userId} (orphaned):`,
      err
    );
  }

  return NextResponse.json({ deleted: true }, { status: 200 });
}
