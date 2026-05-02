/**
 * v1.1 free-tier slice 5 — "Process my history" backfill function.
 *
 * Spec: docs/v1-1/free-tier-phase2-plan.md §A.4. After a FREE→PRO/
 * TRIAL upgrade, the user can opt into running their pre-PRO
 * entries through the full extraction pipeline:
 *
 *   1. Whisper has already run on each entry — transcript is set.
 *   2. The FREE/Haiku branch wrote a one-sentence summary, set
 *      themes=[] / wins=[] / blockers=[], left rawAnalysis=null,
 *      and skipped extraction + memory + lifemap + embedding.
 *   3. This function picks up where that left off: re-extract
 *      with Claude, persist themes/wins/blockers/tasks/etc., write
 *      the embedding, and flip Entry.extracted = true.
 *
 * Per-step retry isolation matters: the Claude call is the
 * dominant cost + flakiness vector. We wrap each entry's full
 * extract+persist+embed in its own step.run so a single transient
 * failure on entry N doesn't replay extractions 1..N-1.
 *
 * Concurrency: per-user limit 1. Stops a double-tap of the
 * /api/backfill/start endpoint from running two passes at once;
 * the WHERE filter would naturally dedupe but the per-user lock
 * is cheaper than the duplicate Claude calls.
 *
 * Cost cap: 60-day window for the default `recent` pass. The
 * second `older` pass is opt-in from /account. Worst-case 60 ×
 * $0.011 = $0.66/user for `recent`. See
 * `apps/web/src/lib/backfill-extractions.ts:BACKFILL_WINDOW_RECENT_DAYS`
 * for the constant.
 */

import { Prisma } from "@prisma/client";
import { NonRetriableError } from "inngest";

import { inngest } from "@/inngest/client";
import {
  backfillWindowCutoff,
  type BackfillWindow,
} from "@/lib/backfill-extractions";
import { safeLog } from "@/lib/safe-log";

/**
 * Maximum entries processed per Inngest run. Belt-and-suspenders
 * cap on top of the 60-day window — protects against an absurd
 * cohort (1+ entry/day for 60 days = 60 entries — nominal). If a
 * user has more, they fall through to the next run via the WHERE
 * filter (re-call /api/backfill/start, function picks up the
 * remainder).
 */
const MAX_ENTRIES_PER_RUN = 200;

export const backfillExtractionsFn = inngest.createFunction(
  {
    id: "backfill-extractions",
    name: "Backfill extractions for upgraded user",
    concurrency: {
      key: "event.data.userId",
      limit: 1,
    },
    retries: 2,
    triggers: [{ event: "entry/backfill.requested" }],
  },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as {
      userId?: unknown;
      requestedAt?: unknown;
      window?: unknown;
    };
    const userId =
      typeof data.userId === "string" && data.userId.length > 0
        ? data.userId
        : null;
    if (!userId) {
      throw new NonRetriableError("backfill: missing userId in event payload");
    }
    const window: BackfillWindow =
      data.window === "older" ? "older" : "recent";

    const { prisma } = await import("@/lib/prisma");
    const { extractFromTranscript } = await import("@/lib/pipeline");
    const { recordThemesFromExtraction } = await import("@/lib/themes");
    const { buildEmbedText, embedText } = await import("@/lib/embeddings");
    const { isEnabled } = await import("@/lib/feature-flags");

    // ── Step 1: load eligible entries ───────────────────────────────
    const candidates = await step.run("load-candidates", async () => {
      const cutoff = backfillWindowCutoff(window);
      return prisma.entry.findMany({
        where: {
          userId,
          extracted: false,
          rawAnalysis: { equals: Prisma.DbNull },
          status: "COMPLETE",
          transcript: { not: null },
          createdAt:
            cutoff.gt !== undefined
              ? { gt: cutoff.gt }
              : { lte: cutoff.lte! },
        },
        select: {
          id: true,
          transcript: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: MAX_ENTRIES_PER_RUN,
      });
    });

    if (candidates.length === 0) {
      // No-op tick — possibly a duplicate dispatch or already
      // backfilled. Touch backfillStartedAt so the UI can show
      // "we tried, nothing to do" rather than spinning forever.
      await step.run("mark-empty-completion", async () => {
        await prisma.user.update({
          where: { id: userId },
          data: { backfillCompletedAt: new Date() },
        });
      });
      safeLog.info("backfill.empty", { userId, window });
      return { processed: 0, window, userId };
    }

    // V5 dispositional-themes flag — backfilled entries should use
    // the same prompt the user's NEW entries use. Read once;
    // entries within a single backfill all get consistent treatment.
    const useDispositional = await step.run(
      "compute-prompt-variant",
      async () => isEnabled(userId, "v1_1_dispositional_themes")
    );

    // ── Step 2: per-entry — extract + persist + embed + flag ────────
    let succeeded = 0;
    let failed = 0;
    for (const entry of candidates) {
      // Step granularity: ONE step.run per entry covering the full
      // extract→persist→embed→flag sequence. Inngest retries the
      // whole step on transient failure — idempotent because the
      // WHERE filter excludes already-flagged entries on replay.
      const result = await step.run(
        `process-entry-${entry.id}`,
        async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
          try {
            const transcript = entry.transcript ?? "";
            if (!transcript.trim()) {
              return { ok: false, reason: "empty-transcript" };
            }
            // Inngest serializes step.run return values as JSON, so
            // Date fields come back as ISO strings. Parse defensively
            // so the slice handles both shapes.
            const createdAt =
              typeof entry.createdAt === "string"
                ? new Date(entry.createdAt)
                : entry.createdAt;
            const todayISO = createdAt.toISOString().slice(0, 10);
            const extraction = await extractFromTranscript(
              transcript,
              todayISO,
              undefined, // memoryContext skipped for backfill — old entries are
                          // pre-memory anyway
              null, // goalContext
              [], // taskGroupNames
              null, // dimensionContext
              useDispositional
            );

            await prisma.$transaction(async (tx) => {
              const updated = await tx.entry.update({
                where: { id: entry.id },
                data: {
                  summary: extraction.summary,
                  mood: extraction.mood,
                  moodScore: extraction.moodScore,
                  energy: extraction.energy,
                  themes: extraction.themes,
                  wins: extraction.wins,
                  blockers: extraction.blockers,
                  rawAnalysis: extraction as unknown as object,
                  extracted: true,
                },
                select: { id: true, createdAt: true },
              });

              await recordThemesFromExtraction(
                tx,
                userId,
                updated.id,
                updated.createdAt,
                extraction.themesDetailed
              );
            });

            // Embedding — fail-soft, logs to safeLog (per the
            // 2026-05-02 observability fix). A missed embedding
            // means this entry won't show up in semantic search
            // until the standalone backfill-entry-embeddings.ts
            // script runs; it does NOT block the extracted flag.
            try {
              const text = buildEmbedText({
                summary: extraction.summary,
                transcript,
              });
              if (text) {
                const vec = await embedText(text);
                await prisma.entry.update({
                  where: { id: entry.id },
                  data: { embedding: vec },
                });
              }
            } catch (embedErr) {
              safeLog.warn("backfill.embedding-failed", {
                userId,
                entryId: entry.id,
                err:
                  embedErr instanceof Error
                    ? embedErr.message
                    : String(embedErr),
              });
            }
            return { ok: true };
          } catch (err) {
            // Mark the entry as "tried but failed" — flag extracted
            // = true so we don't loop on a poison transcript, set
            // partialReason for diagnostics. Per spec §A.4 step 3:
            // "don't loop a broken transcript."
            await prisma.entry.update({
              where: { id: entry.id },
              data: {
                extracted: true,
                partialReason: "backfill-extract-failed",
              },
            });
            safeLog.warn("backfill.extract-failed", {
              userId,
              entryId: entry.id,
              err: err instanceof Error ? err.message : String(err),
            });
            return {
              ok: false,
              reason: err instanceof Error ? err.message : "unknown",
            };
          }
        }
      );
      if (result.ok) succeeded += 1;
      else failed += 1;
    }

    // ── Step 3: completion bookkeeping + email ──────────────────────
    const tally = await step.run("compute-counts", async () => {
      // Re-count both windows so the email can mention the older
      // bucket if anything remains.
      const olderCutoff = backfillWindowCutoff("older");
      const olderCount = await prisma.entry.count({
        where: {
          userId,
          extracted: false,
          rawAnalysis: { equals: Prisma.DbNull },
          status: "COMPLETE",
          transcript: { not: null },
          createdAt: { lte: olderCutoff.lte! },
        },
      });
      return {
        recentProcessed: succeeded,
        recentFailed: failed,
        olderRemaining: olderCount,
      };
    });

    await step.run("mark-completed", async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { backfillCompletedAt: new Date() },
      });
    });

    await step.run("send-completion-email", async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });
        if (!user?.email) return;
        const firstName =
          (user.name ?? "").split(" ")[0]?.trim() || "there";
        const { getResendClient } = await import("@/lib/resend");
        const {
          backfillCompleteHtml,
          backfillCompleteSubject,
        } = await import("@/emails/backfill-complete");
        const resend = getResendClient();
        await resend.emails.send({
          from: process.env.EMAIL_FROM || "Acuity <hello@getacuity.io>",
          to: user.email,
          subject: backfillCompleteSubject(),
          html: backfillCompleteHtml({
            firstName,
            recentCount: tally.recentProcessed,
            olderCount:
              window === "recent" ? tally.olderRemaining : 0,
          }),
        });
      } catch (err) {
        safeLog.warn("backfill.email-failed", {
          userId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    });

    safeLog.info("backfill.complete", { userId, window, ...tally });
    return {
      userId,
      window,
      processed: tally.recentProcessed,
      failed: tally.recentFailed,
      olderRemaining: tally.olderRemaining,
    };
  }
);
