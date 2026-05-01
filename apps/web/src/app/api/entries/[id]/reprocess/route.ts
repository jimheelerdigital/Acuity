import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/lib/auth";
import { inngest } from "@/inngest/client";

/**
 * POST /api/entries/:id/reprocess
 *
 * Re-fires the entry/process.requested Inngest event for an existing
 * entry whose pipeline run terminated in PARTIAL or FAILED. The audio
 * blob is already in Supabase storage (the original upload succeeded
 * — that's why the entry exists at all), so the function's
 * download-audio step still works on the second invocation.
 *
 * Owner-gated: must be the entry's userId on the session. Status-
 * gated: only PARTIAL / FAILED entries are reprocessable. Anything
 * still in-flight (PENDING / QUEUED / TRANSCRIBING / EXTRACTING /
 * PERSISTING) is ignored — those are already running, the user is
 * just impatient.
 *
 * Response: 202 + { entryId, status: "QUEUED" } on success, mirroring
 * the original /api/record async-path return shape so the same client
 * polling code drops in unchanged.
 */
const REPROCESSABLE_STATUSES = new Set(["PARTIAL", "FAILED"]);

export async function POST(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const entry = await prisma.entry.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, userId: true, status: true, audioPath: true },
  });

  if (!entry || entry.userId !== userId) {
    // Don't leak existence to a non-owner.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!entry.audioPath) {
    return NextResponse.json(
      { error: "Entry has no audio to reprocess" },
      { status: 400 }
    );
  }

  if (!REPROCESSABLE_STATUSES.has(entry.status)) {
    return NextResponse.json(
      {
        error: "Entry is not in a reprocessable state",
        status: entry.status,
      },
      { status: 409 }
    );
  }

  // Reset status + clear the prior error so the UI flips out of the
  // partial/failed view as soon as the next poll lands.
  await prisma.entry.update({
    where: { id: entry.id },
    data: {
      status: "QUEUED",
      errorMessage: null,
      partialReason: null,
    },
  });

  await inngest.send({
    name: "entry/process.requested",
    data: { entryId: entry.id, userId },
  });

  return NextResponse.json(
    { entryId: entry.id, status: "QUEUED" },
    { status: 202 }
  );
}
