/**
 * POST /api/user/delete
 *
 * Permanently deletes the signed-in user's account and all associated
 * data. Required for SECURITY_AUDIT.md S3 / GDPR Art. 17 compliance.
 *
 * Auth: symmetric — cookie session on web, Bearer JWT on mobile, via
 * getAnySessionUserId. Apple-sign-in users (private-relay emails) and
 * email-typing was always going to be hostile, so confirmation moved
 * to a literal "DELETE" string.
 *
 * Confirmation: body must include `{ confirm: "DELETE" }` (case-
 * sensitive, exact). Defense-in-depth — the UI gates on it too. The
 * legacy `confirmEmail` shape is still accepted for any old web
 * client that hasn't picked up the new modal yet (mobile is OTA so
 * the new shape ships immediately).
 *
 * Order of operations:
 *   1. Stripe customer cancellation (best-effort).
 *   2. Delete VerificationToken rows by email (NextAuth tokens are
 *      keyed on identifier, no FK to User).
 *   3. Delete the User row in a transaction. Cascades drop Account,
 *      Session, Entry, Task, Goal, WeeklyReport, LifeMapArea,
 *      UserMemory automatically.
 *   4. Storage cleanup: list + delete every object under
 *      `voice-entries/${userId}/` (best-effort).
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
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
const CONFIRM_PHRASE = "DELETE";

export async function POST(req: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  // Symmetric auth: NextAuth cookie on web, Bearer JWT on mobile.
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 1b. Rate limit (3 attempts per day per user) ────────────────────────
  const rl = await checkRateLimit(limiters.accountDelete, `user:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  // ── 2. Body validation ───────────────────────────────────────────────────
  // New shape: `{ confirm: "DELETE" }`. Legacy: `{ confirmEmail: <email> }`
  // — accepted for clients that haven't picked up the new modal yet,
  // matched against the user's actual email after we re-fetch below.
  const body = await req.json().catch(() => null);
  const confirmString = typeof body?.confirm === "string" ? body.confirm : "";
  const legacyConfirmEmail =
    typeof body?.confirmEmail === "string"
      ? body.confirmEmail.trim().toLowerCase()
      : "";

  if (!confirmString && !legacyConfirmEmail) {
    return NextResponse.json(
      { error: "Confirmation required" },
      { status: 400 }
    );
  }
  if (confirmString && confirmString !== CONFIRM_PHRASE) {
    return NextResponse.json(
      {
        error:
          'Confirmation must be the word "DELETE" in capital letters.',
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

  // Legacy email confirmation path — only enforced if the new
  // CONFIRM_PHRASE wasn't supplied.
  if (!confirmString && legacyConfirmEmail) {
    if (user.email.toLowerCase() !== legacyConfirmEmail) {
      return NextResponse.json(
        { error: "Confirmation email does not match the signed-in account" },
        { status: 400 }
      );
    }
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
    const { canonicalizeEmail } = await import("@/lib/bootstrap-user");
    const normalizedEmail = canonicalizeEmail(user.email);
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
