/**
 * POST /api/entries/[id]/cancel
 *
 * Marks an in-flight Entry as canceled. The Inngest pipeline checks
 * `canceledAt` at the start of each `step.run()` block; if set, the
 * pipeline transitions the entry to status="FAILED" with errorMessage
 * "__canceled_by_user__" and bails.
 *
 * Slice C, Stage 2 (2026-05-16). Additive endpoint — purely new path,
 * no contract change to anything the live build-42 binary depends on.
 *
 * Response shape (per status code):
 *   200  { ok: true, alreadyCanceled?: true }  — newly canceled OR
 *                                                already canceled
 *   404  { error: "NotFound" }                  — entry doesn't exist
 *                                                or doesn't belong to
 *                                                this user
 *   410  { error: "AlreadyComplete" }           — entry is already
 *                                                COMPLETE / PARTIAL /
 *                                                FAILED. Client should
 *                                                delete the entry
 *                                                locally instead.
 *   401  { error: "Unauthorized" }              — no session
 *
 * Idempotency: a second cancel call on an already-canceled entry
 * returns 200 with `alreadyCanceled: true`. The pipeline only checks
 * `canceledAt != null`, so re-setting to a newer timestamp would have
 * no semantic effect.
 *
 * Why 410 for terminal states: Apple's "PROCESSED, too late to cancel"
 * is the semantic — the client should treat the entry as already done
 * and either delete it locally or surface it. Build 43+ mobile maps
 * 410 to "Hmm, we just finished processing that — open it?" UX.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TERMINAL_STATUSES = new Set(["COMPLETE", "FAILED", "PARTIAL"]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  // Single round-trip: read minimal projection to validate ownership +
  // state before deciding what to do.
  const entry = await prisma.entry.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      userId: true,
      status: true,
      canceledAt: true,
    },
  });

  if (!entry || entry.userId !== userId) {
    return NextResponse.json({ error: "NotFound" }, { status: 404 });
  }

  // Already canceled — idempotent success.
  if (entry.canceledAt) {
    safeLog.info("entries.cancel.already-canceled", {
      userId,
      entryId: entry.id,
    });
    return NextResponse.json({ ok: true, alreadyCanceled: true });
  }

  // Already in a terminal state — too late to cancel. Client should
  // delete the entry locally if the user wants to discard it.
  if (TERMINAL_STATUSES.has(entry.status)) {
    safeLog.info("entries.cancel.too-late", {
      userId,
      entryId: entry.id,
      status: entry.status,
    });
    return NextResponse.json(
      { error: "AlreadyComplete", status: entry.status },
      { status: 410 }
    );
  }

  // Mark as canceled. The Inngest pipeline picks this up at the next
  // step.run() boundary, finalizes to status=FAILED with the canceled
  // marker errorMessage, and bails. We don't mutate status here —
  // letting the pipeline do that keeps the state-transition surface
  // in one place (Inngest's step-by-step graph in process-entry.ts).
  await prisma.entry.update({
    where: { id: entry.id },
    data: { canceledAt: new Date() },
  });

  safeLog.info("entries.cancel.marked", {
    userId,
    entryId: entry.id,
    statusAtCancel: entry.status,
  });

  return NextResponse.json({ ok: true });
}
