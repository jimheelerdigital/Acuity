/**
 * POST /api/life-audit  — queue a Day 14 Life Audit generation for
 *                         the signed-in user (if entitled).
 * GET  /api/life-audit  — return the user's most recent COMPLETE
 *                         Life Audit (for the view page to render).
 *
 * Life Audit is **async-only by design**. The generator is a flagship
 * Opus call that doesn't fit in a Vercel function's response window;
 * there is no sync fallback. If `ENABLE_INNGEST_PIPELINE !== "1"`,
 * POST returns 503. IMPLEMENTATION_PLAN_PAYWALL §1.1 / §5.1.
 *
 * The Day 14 cron (`day14AuditCronFn`) is the canonical entry point
 * for audit creation — it seeds the row + dispatches the event the
 * night before `trialEndsAt`. This HTTP POST route exists for:
 *   - manual on-demand generation (debug + QA)
 *   - future user-triggered audits (e.g. "regenerate" button)
 *   - the "user signs in on Day 14 without the cron having fired"
 *     edge case
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import { requireEntitlement } from "@/lib/paywall";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { prisma } = await import("@/lib/prisma");
  const audit = await prisma.lifeAudit.findFirst({
    where: { userId, kind: "TRIAL_DAY_14", status: "COMPLETE" },
    orderBy: { createdAt: "desc" },
  });

  if (!audit) {
    return NextResponse.json({ audit: null }, { status: 200 });
  }
  return NextResponse.json({ audit }, { status: 200 });
}

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Async-only: without Inngest enabled, there's no generation pathway.
  if (process.env.ENABLE_INNGEST_PIPELINE !== "1") {
    return NextResponse.json(
      { error: "Async pipeline disabled; contact admin" },
      { status: 503 }
    );
  }

  // Rate limit — shared with record / weekly / lifemap-refresh.
  const rl = await checkRateLimit(limiters.expensiveAi, `user:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  // Entitlement check.
  const gate = await requireEntitlement("canGenerateNewLifeAudit", userId);
  if (!gate.ok) return gate.response;

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trialEndsAt: true, createdAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Dedupe — if a TRIAL_DAY_14 audit already exists in a non-terminal
  // state or COMPLETE, return that instead of starting a second run.
  const existing = await prisma.lifeAudit.findFirst({
    where: { userId, kind: "TRIAL_DAY_14" },
    orderBy: { createdAt: "desc" },
  });
  if (existing && existing.status !== "FAILED") {
    return NextResponse.json(
      { lifeAuditId: existing.id, status: existing.status },
      { status: 202 }
    );
  }

  // Period: signup → trialEndsAt (or now, if trialEndsAt is null —
  // shouldn't happen post-§1.6 but defensive).
  const periodStart = user.createdAt;
  const periodEnd = user.trialEndsAt ?? new Date();

  // Count entries up front so we can populate entryCount on the row.
  // The Inngest function will re-verify + reject below threshold.
  const entryCount = await prisma.entry.count({
    where: {
      userId,
      status: "COMPLETE",
      entryDate: { gte: periodStart, lte: periodEnd },
    },
  });

  const audit = await prisma.lifeAudit.create({
    data: {
      userId,
      kind: "TRIAL_DAY_14",
      periodStart,
      periodEnd,
      entryCount,
      // Required @db.Text columns with non-null in schema — fill with
      // empty placeholders. The Inngest function overwrites these
      // when it persists the real narrative.
      narrative: "",
      closingLetter: "",
      themesArc: {},
      status: "QUEUED",
    },
  });

  await inngest.send({
    name: "life-audit/generation.requested",
    data: { lifeAuditId: audit.id, userId },
  });

  safeLog.info("life-audit.queued", {
    userId,
    lifeAuditId: audit.id,
    entryCount,
  });

  return NextResponse.json(
    { lifeAuditId: audit.id, status: "QUEUED" },
    { status: 202 }
  );
}
