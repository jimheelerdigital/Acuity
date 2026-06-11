/**
 * POST /api/admin/entries/[id]/reprocess  (admin-gated ops recovery)
 *
 * Admin-only re-fire of the entry/process.requested Inngest event for a
 * PARTIAL/FAILED entry (audio already in Supabase). Mirrors the owner route
 * (/api/entries/[id]/reprocess) but gated on User.isAdmin and accepts a
 * Bearer token as well as a cookie session, so it's curl-triggerable for
 * ops recovery (e.g. the 2026-05-28 "Connection error." cohort). Because it
 * runs on Vercel it has the integration-injected INNGEST_EVENT_KEY — which
 * a local script does not.
 *
 * Idempotent: only PARTIAL/FAILED are reprocessable; once this re-queues
 * (status→QUEUED) a repeat call gets 409, so it won't double-fire mid-run.
 * Every call is logged (admin id + entry id + outcome).
 */
import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPROCESSABLE = new Set(["PARTIAL", "FAILED"]);

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const entryId = ctx.params.id;

  // Admin gate (Bearer or cookie → then isAdmin).
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    console.warn(`[admin-reprocess] non-admin=${userId} entry=${entryId} → FORBIDDEN`);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entry = await prisma.entry.findUnique({
    where: { id: entryId },
    select: { id: true, userId: true, status: true, audioPath: true },
  });
  if (!entry) {
    console.warn(`[admin-reprocess] admin=${userId} entry=${entryId} → NOT_FOUND`);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!entry.audioPath) {
    console.warn(`[admin-reprocess] admin=${userId} entry=${entryId} → NO_AUDIO`);
    return NextResponse.json(
      { error: "Entry has no audio to reprocess" },
      { status: 400 }
    );
  }
  if (!REPROCESSABLE.has(entry.status)) {
    console.warn(
      `[admin-reprocess] admin=${userId} entry=${entryId} status=${entry.status} → NOT_REPROCESSABLE`
    );
    return NextResponse.json(
      { error: "Entry is not in a reprocessable state", status: entry.status },
      { status: 409 }
    );
  }

  await prisma.entry.update({
    where: { id: entryId },
    data: { status: "QUEUED", errorMessage: null, partialReason: null },
  });
  await inngest.send({
    name: "entry/process.requested",
    data: { entryId, userId: entry.userId },
  });

  console.info(
    `[admin-reprocess] admin=${userId} entry=${entryId} user=${entry.userId} → REQUEUED+SENT`
  );
  return NextResponse.json(
    { entryId, status: "QUEUED", reprocessedBy: userId },
    { status: 202 }
  );
}
