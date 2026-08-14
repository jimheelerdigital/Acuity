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
import { cancelSubscriptionOnDelete } from "@/lib/cancel-subscription-on-delete";
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
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      subscriptionSource: true,
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

  // ── 3. Subscription cancellation (best-effort, source-aware) ────────────
  // Cancel the active subscription BEFORE the purge so deletion can't leave
  // an orphaned Stripe sub that converts + bills the user post-deletion
  // (incident 2026-06-13 — orphan subscriptions after deletion). The helper
  // resolves the sub by id → customer → email, so it also catches
  // webhook-outage rows whose local Stripe ids were never written. Apple /
  // Google Play subs are store-owned (can't cancel server-side); the delete
  // UI warns the user to cancel in iOS / Play settings. Never throws — the
  // deletion proceeds regardless; we record the outcome on the tombstone.
  const stripeCancellationStatus = await cancelSubscriptionOnDelete(stripe, {
    email: user.email,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionSource: user.subscriptionSource,
    stripeSubscriptionId: user.stripeSubscriptionId,
    stripeCustomerId: user.stripeCustomerId,
  });

  // A failed cancel must not vanish: deletion still proceeds (right to erasure),
  // but founders are alerted so a human finishes the cancellation in Stripe
  // before the orphaned sub bills a deleted account.
  if (stripeCancellationStatus === "failed") {
    const { notifyFoundersOfDeletionCancelFailure } = await import(
      "@/lib/founder-notifications"
    );
    await notifyFoundersOfDeletionCancelFailure({
      email: user.email,
      subscriptionSource: user.subscriptionSource,
      stripeSubscriptionId: user.stripeSubscriptionId,
      timestamp: new Date(),
    }).catch(() => {});
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
  // the reduced-trial path via trialDaysForEmail.
  //
  // IMPORTANT: we use `deleteMany` instead of `delete` for the User row.
  // `delete` returns the deleted row, which forces Prisma to issue a
  // RETURNING clause referencing every column the schema declares. If
  // schema.prisma has a column the prod DB hasn't been migrated for yet
  // (db push lag), the RETURNING fails with "column does not exist" and
  // the whole transaction rolls back — surfacing as a 500 to the user
  // even though the cascade itself would work fine. `deleteMany` returns
  // { count } and uses a plain `DELETE WHERE` with no RETURNING, so it's
  // immune to schema-vs-DB drift. Same defensive pattern as
  // safeUpdateUser elsewhere.
  let stage = "init";
  try {
    const { canonicalizeEmail } = await import("@/lib/bootstrap-user");
    const normalizedEmail = canonicalizeEmail(user.email);
    await prisma.$transaction(async (tx) => {
      stage = "tombstone";
      await tx.deletedUser.upsert({
        where: { email: normalizedEmail },
        create: {
          email: normalizedEmail,
          originalCreatedAt: user.createdAt,
          originalTrialEndedAt: user.trialEndsAt ?? null,
          subscriptionSource: user.subscriptionSource ?? null,
          stripeSubscriptionId: user.stripeSubscriptionId ?? null,
          stripeCancellationStatus,
        },
        update: {
          deletedAt: new Date(),
          originalCreatedAt: user.createdAt,
          originalTrialEndedAt: user.trialEndsAt ?? null,
          subscriptionSource: user.subscriptionSource ?? null,
          stripeSubscriptionId: user.stripeSubscriptionId ?? null,
          stripeCancellationStatus,
        },
      });
      stage = "verification-tokens";
      await tx.verificationToken.deleteMany({
        where: { identifier: user.email },
      });
      // Cascade-gap FK fix (2026-06-23): the previously-manual deleteMany
      // cleanup for experimentAssignment, userFeatureOverride,
      // lifeMapAreaHistory, goalSuggestion, and founderNotificationLog is
      // gone — those relations now carry onDelete: Cascade at the DB level
      // (prisma/schema.prisma), so the User delete below cascades them
      // automatically. Same for consentRecord (newly cascaded — this was
      // the orphan source, see docs/specs/smart-notifications-spec.md §8).
      // ProgressSuggestion still cascades via its Goal FK; ClaudeCallLog is
      // intentionally SetNull to preserve aggregate cost telemetry.
      stage = "user-delete";
      const result = await tx.user.deleteMany({ where: { id: userId } });
      if (result.count === 0) {
        throw new Error("user row vanished mid-transaction");
      }
    });
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err
        ? String((err as { code?: unknown }).code)
        : "n/a";
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[user/delete] DB delete failed for user ${userId} at stage="${stage}" code=${code}: ${message}`,
      err
    );
    return NextResponse.json(
      {
        error:
          "Account deletion failed — please try again or contact support",
        // Surface only the stage tag (not the underlying SQL/PII) so the
        // client can show a specific support message; the full error is
        // captured in server logs.
        stage,
      },
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
