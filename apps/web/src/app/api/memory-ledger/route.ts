/**
 * GET /api/memory-ledger — "what Ripple knows about you", read-only.
 *
 * The data layer for the Memory Ledger. Assembles people, goals, recurring
 * themes, key facts, confirmed patterns (with receipts), what we're
 * uncertain about, and the user's own corrections — all from tables that
 * already exist. Writes nothing, calls no model.
 *
 * Gated on EVIDENCE_RECEIPTS: 404 when off, matching the convention in
 * lib/feature-flags.ts that a disabled feature should not leak its
 * existence.
 *
 * NO UI YET. This is deliberately the data layer only — the payload shape
 * is the thing worth settling first, since it encodes the product's central
 * claim: anything in `patterns` can be backed by a quote, and anything we
 * can't back shows up in `uncertain` with a reason instead of being quietly
 * upgraded or quietly dropped.
 */

import { NextRequest, NextResponse } from "next/server";

import { evidenceReceiptsEnabled } from "@/lib/evidence/flags";
import { buildMemoryLedger } from "@/lib/evidence/memory-ledger";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The aggregation runs five indexed queries over one user's rows. Generous
// but bounded — this is an on-demand read, not a cron.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!evidenceReceiptsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read rate limit: the payload is the user's whole memory surface, so it's
  // worth more than a typical GET both to compute and to exfiltrate.
  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  try {
    const ledger = await buildMemoryLedger(userId);

    safeLog.info("memory-ledger.served", {
      userId,
      patterns: ledger.summary.patternCount,
      uncertain: ledger.summary.uncertainCount,
      // The number to watch during observer mode: how much of what the
      // generator produced we are declining to assert.
      unassertedShare: ledger.summary.unassertedShare,
    });

    return NextResponse.json(ledger);
  } catch (err) {
    safeLog.error("memory-ledger.failed", err, { userId });
    return NextResponse.json(
      { error: "Could not build ledger" },
      { status: 500 }
    );
  }
}
