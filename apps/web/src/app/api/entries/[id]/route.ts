import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { supabase } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

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
