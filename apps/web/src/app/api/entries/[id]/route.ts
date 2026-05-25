import { NextRequest, NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { safeLog } from "@/lib/safe-log";
import { supabase } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

const PATCH_MIN_TRANSCRIPT_CHARS = 1;
const PATCH_MAX_TRANSCRIPT_CHARS = 50_000;
const ESTIMATED_REPROCESS_SECONDS = 30;

const STORAGE_BUCKET = "voice-entries";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const entry = await prisma.entry.findUnique({
    where: { id: params.id },
    include: {
      tasks: {
        select: {
          id: true,
          // `title` + `description` were missing here — caused the mobile
          // Entry view's Tasks section to render card shells with empty
          // bodies (priority + status pill only). `text` is a legacy
          // Task field; both the mobile Entry card and TaskDTO consume
          // `title`, so select that directly and drop `text` from the
          // projection.
          title: true,
          description: true,
          dueDate: true,
          priority: true,
          status: true,
          // goalId + groupId align the shape with TaskDTO / the full
          // Task row so downstream consumers (including future deep-
          // link-from-entry-to-goal) don't need a second query.
          goalId: true,
          groupId: true,
          entryId: true,
          createdAt: true,
        },
      },
    },
  });

  if (!entry || entry.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    entry: {
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      tasks: entry.tasks.map((t) => ({
        ...t,
        dueDate: t.dueDate?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
    },
  });
}

/**
 * PATCH /api/entries/[id]
 *
 * Body: { transcript: string }
 *
 * User-driven edit of an entry's transcript. Wipes the derived AI
 * state for re-derivation (themes / wins / blockers / summary /
 * embedding / people mentions) and queues the existing
 * process-entry Inngest function with `skipTranscribe: true` so the
 * pipeline re-runs without re-Whispering the audio.
 *
 * Preserved across the edit:
 *   - Committed Task and Goal rows derived from this entry — the
 *     user already accepted them in extraction-review, so they're
 *     real. Re-extraction will create suggested rows again; the user
 *     can review again.
 *   - Entry.linkedEventIds — the user's manual link/unlink choices
 *     on calendar events stay intact (process-entry skips the
 *     link-calendar-events step on edit reprocesses).
 *   - Person records — Anchor People resolution is at the Person
 *     level, independent of any one entry's mentions. The
 *     EntityMention rows for THIS entry are wiped (cascade) and
 *     re-created against the fresh transcript; Person.canonicalName,
 *     displayName, and aliases all persist.
 *
 * Race handling: lastEditedAt + the triggeredByEditAt event payload
 * give the worker a staleness check at the top — a second PATCH
 * landing mid-flight bumps lastEditedAt and the older run short-
 * circuits without racing the newer one's writes.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    transcript?: unknown;
  };
  const transcript =
    typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (
    transcript.length < PATCH_MIN_TRANSCRIPT_CHARS ||
    transcript.length > PATCH_MAX_TRANSCRIPT_CHARS
  ) {
    return NextResponse.json(
      { error: "InvalidTranscript" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  const entry = await prisma.entry.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, status: true, transcript: true },
  });
  if (!entry || entry.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Don't accept edits to entries still in their first-pass pipeline.
  // The user can edit once status is COMPLETE / PARTIAL / FAILED.
  const editableStatuses = new Set(["COMPLETE", "PARTIAL", "FAILED"]);
  if (!editableStatuses.has(entry.status)) {
    return NextResponse.json(
      { error: "EntryInFlight", status: entry.status },
      { status: 409 }
    );
  }

  // No-op short-circuit when the transcript is identical. Saves the
  // user from accidentally triggering a 30s reprocess by tapping
  // Save with no real changes.
  if ((entry.transcript ?? "").trim() === transcript) {
    return NextResponse.json({
      reprocessing: false,
      estimatedSeconds: 0,
      noChange: true,
    });
  }

  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // Wipe derived AI state. linkedEventIds intentionally NOT
      // cleared — user manual choices persist (slice 6).
      await tx.entry.update({
        where: { id: entry.id },
        data: {
          transcript,
          lastEditedAt: now,
          reprocessingStartedAt: now,
          status: "QUEUED",
          summary: null,
          mood: null,
          moodScore: null,
          energy: null,
          themes: [],
          wins: [],
          blockers: [],
          rawAnalysis: undefined,
          embedding: [],
          peopleExtractedAt: null,
          themePromptVersion: null,
          extracted: false,
          errorMessage: null,
          partialReason: null,
        },
      });
      // ThemeMention + EntityMention rows for THIS entry are stale.
      // FK cascade would also clear them on entry delete; here we
      // explicitly delete since the row stays.
      await tx.themeMention.deleteMany({ where: { entryId: entry.id } });
      await tx.entityMention.deleteMany({ where: { entryId: entry.id } });
    });
  } catch (err) {
    safeLog.error("entry.patch.transaction_failed", {
      userId,
      entryId: entry.id,
      err: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "PatchFailed" }, { status: 500 });
  }

  try {
    await inngest.send({
      name: "entry/process.requested",
      data: {
        entryId: entry.id,
        userId,
        skipTranscribe: true,
        triggeredByEditAt: now.toISOString(),
      },
    });
  } catch (err) {
    safeLog.error("entry.patch.inngest_send_failed", {
      userId,
      entryId: entry.id,
      err: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "ReprocessQueueFailed" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    reprocessing: true,
    estimatedSeconds: ESTIMATED_REPROCESS_SECONDS,
  });
}

/**
 * DELETE /api/entries/[id] — user-initiated entry deletion.
 *
 * Authorization: must own the entry (entry.userId === session userId).
 * Mirrors the read path's existence check — non-owners get 404, not
 * 403, so the endpoint doesn't leak whether someone else's id exists.
 *
 * Cascade behavior (Prisma + Postgres FKs):
 *   - ThemeMention rows referencing this entry → cascade-deleted
 *     (schema.prisma line 913: onDelete: Cascade).
 *   - Task rows referencing this entry → cascade-deleted (schema.prisma
 *     line 440: onDelete: Cascade).
 *   - The Theme rows themselves stay — only the entry-theme link goes.
 *   - Audio object in Supabase Storage → best-effort remove (orphan-
 *     tolerant: if the file is already missing or storage call fails,
 *     log and proceed).
 *   - In-flight Inngest run (status non-terminal): we do NOT call an
 *     active cancel — there's no SDK helper for it on this client and
 *     adding the REST plumbing is out of scope. The run will fail-safe
 *     when its next step tries to update the now-missing Entry row;
 *     Inngest marks the run failed and moves on. We log a warning so
 *     this shows up in audit triage if it matters later.
 *
 * Returns 200 { success: true } on success; 404 on miss/foreign;
 * 500 on DB failure (the delete transaction either commits or doesn't —
 * partial state would be a Postgres bug, not ours).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const entry = await prisma.entry.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      userId: true,
      audioPath: true,
      audioUrl: true,
      status: true,
      inngestRunId: true,
    },
  });

  if (!entry || entry.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // In-flight pipeline detection — log only. Spec accepts a fail-safe
  // approach: process-entry's next DB write will throw on the missing
  // Entry row, Inngest marks the run failed.
  const nonTerminal = new Set([
    "QUEUED",
    "TRANSCRIBING",
    "EXTRACTING",
    "PERSISTING",
    "PENDING",
    "PROCESSING",
  ]);
  if (entry.inngestRunId && nonTerminal.has(entry.status)) {
    console.warn(
      `[entries.delete] entry=${entry.id} deleted while in-flight (status=${entry.status}, runId=${entry.inngestRunId}). Inngest run will fail-safe on next step.`
    );
  }

  // DB delete first — this is the source-of-truth privacy guarantee.
  // Audio cleanup is best-effort *after* the row is gone, so a failed
  // storage call doesn't leave a phantom Entry pointing at an audio
  // we couldn't remove.
  try {
    await prisma.entry.delete({ where: { id: entry.id } });
  } catch (err) {
    console.error(`[entries.delete] DB delete failed for entry=${entry.id}:`, err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  // Best-effort storage cleanup. audioPath is the canonical async-path
  // location ("voice-entries/<userId>/<entryId>.webm"); audioUrl is the
  // legacy sync-path field that may hold a signed URL we can't directly
  // remove from. Skip cleanly if the entry never had audio (text-only
  // edge case) or if the file is already gone.
  if (entry.audioPath) {
    try {
      const path = entry.audioPath.startsWith(`${STORAGE_BUCKET}/`)
        ? entry.audioPath.slice(STORAGE_BUCKET.length + 1)
        : entry.audioPath;
      const { error: rmErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([path]);
      if (rmErr) {
        console.warn(
          `[entries.delete] Storage remove failed for entry=${entry.id} path=${path} (orphaned):`,
          rmErr
        );
      }
    } catch (err) {
      console.warn(
        `[entries.delete] Storage remove threw for entry=${entry.id} (orphaned):`,
        err
      );
    }
  }

  // Structured audit log per spec — kept lightweight (no DB row, just
  // a parseable console line) so Vercel log search can reconstruct a
  // delete history without growing a new table.
  console.log(
    JSON.stringify({
      event: "entry.deleted",
      entryId: entry.id,
      userId,
      status: entry.status,
      hadAudio: Boolean(entry.audioPath),
      ts: new Date().toISOString(),
    })
  );

  return NextResponse.json({ success: true });
}
