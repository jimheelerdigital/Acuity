import { NextRequest, NextResponse } from "next/server";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

/**
 * DEPRECATED — the 5-email waitlist drip sequence was retired
 * 2026-04-24 in favor of the per-User trial sequence orchestrated by
 * the `trial-email-orchestrator` Inngest function. This route is
 * retained at the same path so the Vercel cron (0 14 * * *) keeps
 * firing without 404-ing, but the body is now a no-op: it reads no
 * rows from the Waitlist table and sends zero emails. The Waitlist
 * rows themselves stay intact as a historical record — see the
 * TRIAL_SEQUENCE migration entry in progress.md for full context.
 *
 * If you need to resurrect any waitlist email logic, restore the
 * prior implementation from git history (commit immediately before
 * the TRIAL_SEQUENCE launch). Do NOT layer new email logic in here —
 * the onboarding lives in the trial orchestrator.
 *
 * The one-off "You're in — here's your access link" email for the
 * 14 grandfathered Founding Members is a separate script (see
 * emails/waitlist-activation.tsx) and is not touched by this cron.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Cron not configured" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  safeLog.info("waitlist-drip.retired.noop", {
    ts: new Date().toISOString(),
  });

  return NextResponse.json({
    retired: true,
    processed: 0,
    sent: 0,
    errors: 0,
    note: "Waitlist drip retired. Onboarding now handled by trial-email-orchestrator Inngest function.",
    timestamp: new Date().toISOString(),
  });
}
