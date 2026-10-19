import type { PrismaClient } from "@prisma/client";

/**
 * Processing-time measurement (2026-10-17, Miro "Speed up processing").
 *
 * Before changing anything about the pipeline we need to know where the
 * seconds go. Each phase mark is a tiny jsonb append on the Entry row,
 * made from INSIDE existing Inngest steps — adding step.run boundaries
 * would itself add latency (each boundary is a fresh serverless
 * invocation) and skew the numbers we're trying to read.
 *
 * Entry.processingTimeline = [{ p: "transcribe_start", at: 1760700000000 }, …]
 * Entry.createdAt is the implicit "queued" mark.
 */

export type ProcessingPhase =
  | "transcribe_start"
  | "transcribe_done"
  | "transcript_provided" // typed / handwritten: no Whisper
  | "extract_start"
  | "extract_done"
  | "persist_done"
  | "finished";

export type TimelineMark = { p: ProcessingPhase; at: number };

/** Append one mark. Never throws — measurement must not break the pipeline. */
export async function markPhase(
  prisma: Pick<PrismaClient, "$executeRaw">,
  entryId: string,
  phase: ProcessingPhase,
  at: number = Date.now()
): Promise<void> {
  try {
    const mark = JSON.stringify([{ p: phase, at }]);
    await prisma.$executeRaw`
      UPDATE "Entry"
      SET "processingTimeline" = COALESCE("processingTimeline", '[]'::jsonb) || ${mark}::jsonb
      WHERE id = ${entryId}
    `;
  } catch {
    // best-effort
  }
}

export type TimelineSummary = {
  /** createdAt → first pipeline mark (Inngest queue + cold start). */
  queueMs: number | null;
  /** transcribe_start → transcribe_done (download + Whisper). */
  whisperMs: number | null;
  /** transcribe_done|transcript_provided → extract_start (context steps + boundaries). */
  preExtractMs: number | null;
  /** extract_start → extract_done (Claude). */
  extractMs: number | null;
  /** extract_done → persist_done. */
  persistMs: number | null;
  /** persist_done → finished (people, embed, memory, lifemap, streak, push). */
  tailMs: number | null;
  /** createdAt → finished. */
  totalMs: number | null;
};

function find(marks: TimelineMark[], p: ProcessingPhase): number | null {
  const m = marks.find((x) => x.p === p);
  return m ? m.at : null;
}

function diff(a: number | null, b: number | null): number | null {
  return a != null && b != null && b >= a ? b - a : null;
}

/** Pure: turn the stored marks into per-phase durations. */
export function summarizeTimeline(
  raw: unknown,
  createdAt: Date
): TimelineSummary {
  const marks: TimelineMark[] = Array.isArray(raw)
    ? raw.filter(
        (x): x is TimelineMark =>
          !!x && typeof x === "object" && typeof (x as TimelineMark).at === "number" && typeof (x as TimelineMark).p === "string"
      )
    : [];
  const created = createdAt.getTime();
  const tStart = find(marks, "transcribe_start");
  const tDone = find(marks, "transcribe_done") ?? find(marks, "transcript_provided");
  const eStart = find(marks, "extract_start");
  const eDone = find(marks, "extract_done");
  const pDone = find(marks, "persist_done");
  const fin = find(marks, "finished");
  const first = marks.length ? Math.min(...marks.map((m) => m.at)) : null;
  return {
    queueMs: diff(created, first),
    whisperMs: diff(tStart, tDone),
    preExtractMs: diff(tDone, eStart),
    extractMs: diff(eStart, eDone),
    persistMs: diff(eDone, pDone),
    tailMs: diff(pDone, fin),
    totalMs: diff(created, fin),
  };
}
