import { NonRetriableError } from "inngest";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

import { WHISPER_LANGUAGE, WHISPER_MODEL } from "@acuity/shared";

import { inngest } from "@/inngest/client";
import {
  extensionForMimeType,
  mimeTypeFromAudioPath,
} from "@/lib/audio";
import {
  CONNECTION_MESSAGE,
  NO_SPEECH_MESSAGE,
  isConnectionError,
} from "@/lib/recording-errors";

type ProcessEntryEventData = {
  entryId: string;
  userId: string;
  // Slice 2 entry-edit reprocess (2026-05-25). When true, the
  // download-transcribe step short-circuits and trusts the existing
  // Entry.transcript — the user already edited it, we'd just
  // overwrite their corrections by re-running Whisper. The audio
  // path is left untouched so a future re-edit / true reprocess
  // can still re-transcribe if needed.
  skipTranscribe?: boolean;
  // ISO timestamp of the edit that triggered this run. The function
  // checks it against Entry.lastEditedAt at the top — when a second
  // edit has landed mid-flight, the older run short-circuits as
  // stale rather than racing the newer one's writes.
  triggeredByEditAt?: string;
};

function truncateForUi(message: string, max = 160): string {
  return message.length > max ? message.slice(0, max - 1) + "…" : message;
}

export const processEntryFn = inngest.createFunction(
  {
    id: "process-entry",
    name: "Process nightly entry",
    triggers: [{ event: "entry/process.requested" }],
    // USER-INTERACTIVE (Decisions Made 2026-04-19): 2 retries bounds
    // worst-case user-visible latency to roughly 3 minutes.
    retries: 2,
    // One in-flight run per user — serializes back-to-back recordings
    // so UserMemory updates don't race.
    concurrency: { key: "event.data.userId", limit: 1 },
    // Belt-and-suspenders rate limit. HTTP-level rate limit (S5) still
    // lives in the route.
    throttle: { key: "event.data.userId", limit: 10, period: "1h" },
    onFailure: async ({ event, error }) => {
      // onFailure fires after all retries are exhausted. Map the failure
      // to FAILED vs PARTIAL based on whether the transcript step made
      // it through (transcript persists to Entry before extract runs).
      const originalData = (event.data as { event?: { data?: unknown } })?.event
        ?.data as ProcessEntryEventData | undefined;
      const entryId = originalData?.entryId;
      if (!entryId) return;

      const { prisma } = await import("@/lib/prisma");
      const existing = await prisma.entry.findUnique({
        where: { id: entryId },
        select: { status: true, transcript: true },
      });
      if (!existing) return;

      const hasTranscript =
        !!existing.transcript && existing.transcript.trim().length > 0;
      const message = truncateForUi(error?.message ?? "Processing failed");

      if (hasTranscript) {
        await prisma.entry.update({
          where: { id: entryId },
          data: {
            status: "PARTIAL",
            partialReason: "extract-or-persist-failed",
            errorMessage: message,
          },
        });
      } else {
        await prisma.entry.update({
          where: { id: entryId },
          data: { status: "FAILED", errorMessage: message },
        });
      }
    },
  },
  async ({ event, step, runId, logger }) => {
    const {
      entryId,
      userId,
      skipTranscribe,
      triggeredByEditAt,
    } = event.data as ProcessEntryEventData;
    const { prisma } = await import("@/lib/prisma");
    const { supabase } = await import("@/lib/supabase.server");

    // Step 0: link the Entry to this Inngest run (for observability).
    await step.run("record-run-id", async () => {
      await prisma.entry.update({
        where: { id: entryId },
        data: { inngestRunId: runId },
      });
    });

    // Edit-driven reprocess staleness check (slice 2 v1.2 entry edit).
    // If a second PATCH /api/entries/[id] landed while this run was
    // queued, the second send bumped Entry.lastEditedAt. Bail out
    // here so the newer run's writes aren't raced by ours.
    if (skipTranscribe && triggeredByEditAt) {
      const stale = await step.run("edit-staleness-check", async () => {
        const row = await prisma.entry.findUnique({
          where: { id: entryId },
          select: { lastEditedAt: true },
        });
        const dbStamp = row?.lastEditedAt?.getTime() ?? 0;
        const eventStamp = new Date(triggeredByEditAt).getTime();
        // 1s grace handles equality + clock skew between API and worker.
        return dbStamp > eventStamp + 1000;
      });
      if (stale) {
        logger.info(
          `process-entry: stale edit-reprocess for entry=${entryId} (event=${triggeredByEditAt}); newer edit landed, bailing`
        );
        return { entryId, stale: true };
      }
    }

    // Cancellation gate before Whisper (Slice C Stage 3, 2026-05-16).
    // Whisper is the first expensive call ($$ per minute of audio).
    // If the user tapped Cancel on the processing screen between
    // upload and now, transition to FAILED with the canceled marker
    // and bail before spending the Whisper call. Status="FAILED"
    // (not a new CANCELED enum) so the live build-42 binary's
    // useEntryPolling hook still detects the terminal state — a new
    // enum value would hang their spinner until polling timeout.
    //
    // Order note (2026-05-20): gate now runs BEFORE the merged
    // download-transcribe step. Original order ran download → gate →
    // transcribe, but the merged step keeps the audio buffer
    // step-local (see below), so the gate has to live outside it.
    // A second inline check inside the merged step (after download,
    // before the OpenAI call) catches cancels that arrive during the
    // Supabase download window — that's a DB read, not a new
    // step.run, so it doesn't reintroduce the step-boundary that
    // caused the output-size bug.
    const canceledBeforeTranscribe = await step.run(
      "cancel-check-before-transcribe",
      async () => {
        const entry = await prisma.entry.findUnique({
          where: { id: entryId },
          select: { canceledAt: true, status: true },
        });
        if (!entry?.canceledAt) return false;
        if (
          entry.status === "FAILED" ||
          entry.status === "COMPLETE" ||
          entry.status === "PARTIAL"
        ) {
          // Already terminal — don't re-write status.
          return true;
        }
        await prisma.entry.update({
          where: { id: entryId },
          data: {
            status: "FAILED",
            errorMessage: "__canceled_by_user__",
          },
        });
        return true;
      }
    );
    if (canceledBeforeTranscribe) {
      return { entryId, canceled: true, canceledAt: "before-transcribe" };
    }

    // Step 1+2 merged: download audio, transcribe via Whisper, persist
    // transcript. Merged 2026-05-20 to keep the audio buffer
    // step-local — returning audioBase64 from a separate download
    // step tripped Inngest's 4 MB step-output limit for recordings
    // >~3min (HIGH_QUALITY AAC 128 kbps × 1.37 base64 inflation).
    // Buffer never crosses a step boundary now; the step returns
    // only a small `{ transcriptLength }` marker for Inngest UI
    // observability. Cost of a Whisper retry: a re-download from
    // Supabase (free egress at our scale).
    //
    // Persisting the transcript here (vs. buffering until the final
    // transaction) means an extract/persist failure later leaves a
    // recoverable PARTIAL entry with the user's words intact.
    const { transcriptLength } = await step.run(
      "download-transcribe-and-persist",
      async () => {
        // Edit-driven reprocess: the user just PATCHed
        // /api/entries/:id with a new transcript. We don't want to
        // re-run Whisper and stomp their corrections. Return early
        // with the existing transcript length as the marker.
        if (skipTranscribe) {
          const editedEntry = await prisma.entry.findUniqueOrThrow({
            where: { id: entryId },
            select: { userId: true, transcript: true },
          });
          if (editedEntry.userId !== userId) {
            throw new NonRetriableError(
              `Entry ${entryId} does not belong to user ${userId}`
            );
          }
          await prisma.entry.update({
            where: { id: entryId },
            data: { status: "EXTRACTING" },
          });
          return { transcriptLength: editedEntry.transcript?.length ?? 0 };
        }
        const entry = await prisma.entry.findUniqueOrThrow({
          where: { id: entryId },
          select: { audioPath: true, userId: true },
        });
        if (entry.userId !== userId) {
          throw new NonRetriableError(
            `Entry ${entryId} does not belong to user ${userId}`
          );
        }
        if (!entry.audioPath) {
          throw new NonRetriableError(`Entry ${entryId} has no audioPath`);
        }

        await prisma.entry.update({
          where: { id: entryId },
          data: { status: "TRANSCRIBING" },
        });

        const { data, error } = await supabase.storage
          .from("voice-entries")
          .download(entry.audioPath);
        if (error || !data) {
          throw new Error(
            `Audio download failed: ${error?.message ?? "no data"}`
          );
        }

        const buffer = Buffer.from(await data.arrayBuffer());
        const mimeType = mimeTypeFromAudioPath(entry.audioPath);

        // Inline cancel-check before the expensive Whisper call.
        // This is a DB read inside the closure — NOT a new step.run —
        // so it adds no step-boundary cost (which would re-introduce
        // the 4 MB output-size bug if the buffer crossed it). Covers
        // the cancel-during-download window that the outer gate
        // (above the step) can't see.
        const pre = await prisma.entry.findUnique({
          where: { id: entryId },
          select: { canceledAt: true, status: true },
        });
        if (pre?.canceledAt) {
          if (
            pre.status !== "FAILED" &&
            pre.status !== "COMPLETE" &&
            pre.status !== "PARTIAL"
          ) {
            await prisma.entry.update({
              where: { id: entryId },
              data: {
                status: "FAILED",
                errorMessage: "__canceled_by_user__",
              },
            });
          }
          // Signal cancellation upward via the marker. Caller checks
          // transcriptLength < 0 to detect this without throwing.
          return { transcriptLength: -1 };
        }

        // P0: bound the Whisper call. The async client previously had NO
        // timeout (SDK default 600s) — a hung connection tied up the
        // function for 10 minutes. 30s matches the sync pipeline.
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: 30_000,
        });
        // Derive filename from the canonical MIME rather than the
        // storage path. Pre-2026-04-20-afternoon entries were stored as
        // `userId/entryId.mp4`; Whisper's MP4 demuxer trips on those
        // (looks for a video track). extensionForMimeType maps
        // audio/mp4 → "m4a" so we always hand Whisper a filename
        // matching the actual container format.
        const filename = `recording.${extensionForMimeType(mimeType)}`;
        const file = await toFile(buffer, filename, { type: mimeType });

        let res: unknown;
        try {
          res = await openai.audio.transcriptions.create({
            file,
            model: WHISPER_MODEL,
            language: WHISPER_LANGUAGE,
            response_format: "text",
          });
        } catch (err) {
          // P0: classify OpenAI APIConnectionError ("Connection error.") as
          // RETRYABLE — a plain Error lets Inngest retry. The friendly copy
          // becomes the stored errorMessage if all retries are exhausted
          // (web sanitizer passes it through; mobile renders it raw).
          if (isConnectionError(err)) {
            throw new Error(CONNECTION_MESSAGE);
          }
          throw err;
        }
        const transcript = (res as string).trim();

        if (transcript.length < 10) {
          // Genuine silence — non-retryable (retrying silent audio is
          // pointless + burns Whisper spend). Friendly, Bluetooth-aware copy.
          throw new NonRetriableError(NO_SPEECH_MESSAGE);
        }

        await prisma.entry.update({
          where: { id: entryId },
          data: { transcript, status: "EXTRACTING" },
        });

        return { transcriptLength: transcript.length };
      }
    );
    if (transcriptLength < 0) {
      return { entryId, canceled: true, canceledAt: "during-download" };
    }

    // ── FREE / PRO branch ────────────────────────────────────────────
    // v1.1 free-tier redesign: after the transcript is persisted, fork
    // on the user's entitlement. PRO/TRIAL/PAST_DUE run the full
    // extraction pipeline (steps 3–8 below). FREE/expired-trial gets a
    // one-sentence Haiku summary, recording-stats, streak, then exits
    // without extraction/embedding/memory/lifemap. See docs/v1-1/
    // free-tier-phase2-plan.md slice 2.
    const entitlement = await step.run("compute-entitlement", async () => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { subscriptionStatus: true, trialEndsAt: true },
      });
      const { entitlementsFor } = await import("@/lib/entitlements");
      const e = entitlementsFor(user);
      return {
        canExtractEntries: e.canExtractEntries,
        isPostTrialFree: e.isPostTrialFree,
      };
    });

    if (!entitlement.canExtractEntries) {
      // FREE branch — one-sentence Haiku summary then short-circuit.
      // Each substep is its own step.run so retry isolation is per-
      // substep (a Haiku transient failure doesn't replay the streak
      // bump or the recording-stats increment).
      await step.run("summarize-free", async () => {
        const entry = await prisma.entry.findUniqueOrThrow({
          where: { id: entryId },
          select: { transcript: true },
        });
        const transcript = entry.transcript ?? "";
        const { summarizeForFreeTier } = await import("@/lib/free-summary");
        const summary = await summarizeForFreeTier(transcript);
        await prisma.entry.update({
          where: { id: entryId },
          data: { summary, status: "COMPLETE" },
        });
      });

      await step.run("update-recording-stats-free", async () => {
        const entry = await prisma.entry.findUnique({
          where: { id: entryId },
          select: { status: true, createdAt: true },
        });
        if (!entry || entry.status !== "COMPLETE") return;

        const existing = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            firstRecordingAt: true,
            createdAt: true,
            signupUtmSource: true,
            signupUtmCampaign: true,
            foundingMemberNumber: true,
          },
        });
        if (!existing) return;
        const isFirstRecording = existing.firstRecordingAt === null;

        await prisma.user.update({
          where: { id: userId },
          data: {
            firstRecordingAt: existing.firstRecordingAt ?? entry.createdAt,
            lastRecordingAt: entry.createdAt,
            totalRecordings: { increment: 1 },
          },
        });

        if (isFirstRecording) {
          try {
            const { track } = await import("@/lib/posthog");
            const hoursSinceSignup = Math.round(
              (entry.createdAt.getTime() - existing.createdAt.getTime()) /
                (1000 * 60 * 60)
            );
            await track(userId, "first_recording_completed", {
              hoursSinceSignup,
              signupUtmSource: existing.signupUtmSource,
              signupUtmCampaign: existing.signupUtmCampaign,
              foundingMemberNumber: existing.foundingMemberNumber,
              tier: "FREE",
            });
          } catch {
            // PostHog failure is non-fatal
          }
        }
      }).catch((err) => {
        logger.error(
          "[process-entry] update-recording-stats-free failed (non-fatal)",
          { err }
        );
      });

      await step.run("update-streak-free", async () => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            timezone: true,
            lastSessionDate: true,
            currentStreak: true,
            longestStreak: true,
            lastStreakMilestone: true,
          },
        });
        if (!user) return;

        const { computeStreakUpdate } = await import("@/lib/streak");
        const now = new Date();
        const update = computeStreakUpdate({
          now,
          timezone: user.timezone || "America/Chicago",
          lastSessionDate: user.lastSessionDate,
          currentStreak: user.currentStreak,
          longestStreak: user.longestStreak,
          lastStreakMilestone: user.lastStreakMilestone,
        });

        await prisma.user.update({
          where: { id: userId },
          data: {
            lastSessionDate: now,
            currentStreak: update.currentStreak,
            longestStreak: update.longestStreak,
            lastStreakMilestone: update.milestoneHit
              ? update.milestoneHit
              : undefined,
          },
        });

        if (update.milestoneHit) {
          const { track } = await import("@/lib/posthog");
          await track(userId, "streak_milestone_hit", {
            milestone: update.milestoneHit,
            currentStreak: update.currentStreak,
            tier: "FREE",
          });
        }
      }).catch((err) => {
        logger.error(
          "[process-entry] update-streak-free failed (non-fatal)",
          { err }
        );
      });

      return { entryId, free: true };
    }

    // ── PRO/TRIAL path ───────────────────────────────────────────────

    // Step 3: pre-extract context reads. All three are independent
    // (different tables, no shared mutation), so they fan out via
    // Promise.all. Inngest supports Promise.all of step.run() — each
    // sub-step is checkpointed independently, retries are per-step.
    // Speed: was ~3 × sub-second serial → now max(individual latencies)
    // ≈ 1 × sub-second. Modest absolute win but a quick latency-floor
    // reduction with zero behavioral change.
    //
    //   - buildMemoryContext: UserMemory rows + recent entries summary
    //     used to ground the extraction prompt.
    //   - fetchCalendarContext: events around the recording's
    //     createdAt for connected-calendar users; no-op otherwise.
    //     Held in closure for the post-extract linkedEventIds matcher.
    //   - readDispositionalFlag: V5 theme prompt-variant gate. Lifted
    //     out of step.run("extract") W-B 2026-05-03 so persist can
    //     write Entry.themePromptVersion without re-reading.
    // Path B (v1.3.3): trim prompt context for very short entries. A
    // sub-~25-word transcript almost never references a calendar event
    // and doesn't need deep memory grounding — skip those reads + their
    // prompt blocks (saves a Google Calendar call + a UserMemory read +
    // tokens) with no quality loss on one-liners.
    const SHORT_ENTRY_CHARS = 140;
    const isShortEntry = transcriptLength < SHORT_ENTRY_CHARS;
    const [memoryContext, calendarContext, useDispositional] =
      await Promise.all([
        step.run("build-memory-context", async () => {
          if (isShortEntry) return "";
          const { buildMemoryContext } = await import("@/lib/memory");
          return buildMemoryContext(userId);
        }),
        step.run("fetch-calendar-context", async () => {
          if (isShortEntry) return { events: [], promptBlock: "" };
          const { fetchCalendarContext } = await import(
            "@/lib/calendar/context"
          );
          const entry = await prisma.entry.findUnique({
            where: { id: entryId },
            select: { createdAt: true },
          });
          if (!entry) return { events: [], promptBlock: "" };
          return fetchCalendarContext(userId, entry.createdAt);
        }),
        step.run("read-dispositional-flag", async () => {
          const { isEnabled } = await import("@/lib/feature-flags");
          return isEnabled(userId, "v1_1_dispositional_themes");
        }),
      ]);

    // Cancellation gate before Claude extract (Slice C Stage 3,
    // 2026-05-16). Claude is the most expensive call in the pipeline.
    // If the user canceled while Whisper was running, catch it here
    // before spending the Claude call. Same FAILED + marker pattern
    // as the gate before transcribe.
    const canceledBeforeExtract = await step.run(
      "cancel-check-before-extract",
      async () => {
        const entry = await prisma.entry.findUnique({
          where: { id: entryId },
          select: { canceledAt: true, status: true },
        });
        if (!entry?.canceledAt) return false;
        if (
          entry.status === "FAILED" ||
          entry.status === "COMPLETE" ||
          entry.status === "PARTIAL"
        ) {
          return true;
        }
        await prisma.entry.update({
          where: { id: entryId },
          data: {
            status: "FAILED",
            errorMessage: "__canceled_by_user__",
          },
        });
        return true;
      }
    );
    if (canceledBeforeExtract) {
      return { entryId, canceled: true, canceledAt: "before-extract" };
    }

    // Flip status to EXTRACTING so the client polling
    // /api/entries/:id sees the actual phase the pipeline is in
    // instead of "TRANSCRIBING" for the entire Claude window. Was
    // previously left as TRANSCRIBING until persist-extraction
    // (line ~615) wrote PERSISTING. Lying about the phase made the
    // UI feel slower than the underlying pipeline (2026-05-30 P0).
    await step.run("set-extracting-status", async () => {
      await prisma.entry.update({
        where: { id: entryId },
        data: { status: "EXTRACTING" },
      });
    });

    // Step 4: extract structured data via Claude. Uses the exact same
    // prompt + parser as the sync pipeline (`lib/pipeline.ts`). When
    // the entry was recorded from a goal card (Entry.goalId set), we
    // fetch the goal and splice its title/description into the prompt
    // so the extractor anchors the entry to it.
    const extraction = await step.run("extract", async () => {
      const entry = await prisma.entry.findUniqueOrThrow({
        where: { id: entryId },
        select: {
          transcript: true,
          goalId: true,
          dimensionContext: true,
        },
      });
      const transcript = entry.transcript ?? "";
      let goalContext: { title: string; description: string | null } | null =
        null;
      if (entry.goalId) {
        const goal = await prisma.goal.findFirst({
          where: { id: entry.goalId, userId },
          select: { title: true, description: true },
        });
        if (goal) goalContext = goal;
      }
      // Task groups: ensure defaults + fetch names for the prompt's
      // group classifier enum. Same behavior as the sync pipeline.
      const { ensureDefaultTaskGroups } = await import("@/lib/task-groups");
      await ensureDefaultTaskGroups(prisma, userId);
      const taskGroupRows = await prisma.taskGroup.findMany({
        where: { userId },
        orderBy: { order: "asc" },
        select: { name: true },
      });
      const taskGroupNames = taskGroupRows.map((g) => g.name);

      const { extractFromTranscript } = await import("@/lib/pipeline");
      const todayISO = new Date().toISOString().split("T")[0];
      return extractFromTranscript(
        transcript,
        todayISO,
        memoryContext || undefined,
        goalContext,
        taskGroupNames,
        entry.dimensionContext ?? null,
        useDispositional,
        calendarContext.promptBlock
      );
    });

    // Cancellation gate before persist-extraction (Slice C Stage 3,
    // 2026-05-16). At this point the Claude call has already
    // completed — the extraction result is in memory. If the user
    // canceled between Whisper finishing and Claude finishing, we
    // catch it here before writing the extraction's task/goal/theme
    // rows to the DB. The Whisper transcript is already persisted
    // (line 155-158) so the user keeps their words; only the AI-
    // extracted side-effects are skipped.
    const canceledBeforePersist = await step.run(
      "cancel-check-before-persist",
      async () => {
        const entry = await prisma.entry.findUnique({
          where: { id: entryId },
          select: { canceledAt: true, status: true },
        });
        if (!entry?.canceledAt) return false;
        if (
          entry.status === "FAILED" ||
          entry.status === "COMPLETE" ||
          entry.status === "PARTIAL"
        ) {
          return true;
        }
        await prisma.entry.update({
          where: { id: entryId },
          data: {
            status: "FAILED",
            errorMessage: "__canceled_by_user__",
          },
        });
        return true;
      }
    );
    if (canceledBeforePersist) {
      return { entryId, canceled: true, canceledAt: "before-persist" };
    }

    // Step 5: persist extraction + create Tasks/Goals in one transaction.
    await step.run("persist-extraction", async () => {
      await prisma.entry.update({
        where: { id: entryId },
        data: { status: "PERSISTING" },
      });

      const { recordThemesFromExtraction } = await import("@/lib/themes");
      const { persistSubGoalSuggestions, persistProgressSuggestions } =
        await import("@/lib/goals");
      await prisma.$transaction(async (tx) => {
        const entry = await tx.entry.update({
          where: { id: entryId },
          data: {
            summary: extraction.summary,
            mood: extraction.mood,
            moodScore: extraction.moodScore,
            energy: extraction.energy,
            themes: extraction.themes,
            wins: extraction.wins,
            blockers: extraction.blockers,
            rawAnalysis: extraction as unknown as object,
            status: "COMPLETE",
            // Auto-commit (2026-06-08): extraction now materializes tasks
            // + goals into rows immediately (see commitExtractedItems
            // below), so the entry is extracted + committed in the same
            // write. The `extracted` flag was previously never set by this
            // pipeline — only try-claim + backfill set it.
            extracted: true,
            extractionCommittedAt: new Date(),
            // W-B (2026-05-03): persist which prompt produced
            // this entry's themes so theme-distribution.ts can
            // split V5 vs legacy cohorts. Read from the closure
            // captured by the extract-themes step (line 353).
            themePromptVersion: useDispositional
              ? "v5_dispositional"
              : "v0_legacy",
            // Slice 2 v1.2 entry edit — clear the "Re-processing…"
            // marker once persist lands. Null is the steady state
            // for both fresh recordings and post-edit reprocesses.
            reprocessingStartedAt: null,
          },
        });

        // Theme Map: Theme + ThemeMention rows. Same transaction as the
        // Entry write so a failure here aborts to PARTIAL cleanly.
        await recordThemesFromExtraction(
          tx,
          userId,
          entry.id,
          entry.createdAt,
          extraction.themesDetailed
        );

        // Auto-commit (2026-06-08): materialize extracted tasks + goals
        // into Task/Goal rows immediately. The old review gate (park in
        // rawAnalysis.tasks until the user manually commits) broke the
        // core promise — 80% of extractions never got committed. The
        // helper creates tasks, bumps existing goals, and creates new
        // ones. Users edit/delete unwanted items from the lists post-hoc.
        const { commitExtractedItems } = await import(
          "@/lib/commit-extraction"
        );
        await commitExtractedItems(
          tx,
          userId,
          entryId,
          extraction.tasks,
          extraction.goals
        );

        // Anchor-goal bump — when the user recorded "Add a reflection" on
        // a specific goal, Entry.goalId is set. The extraction.goals loop
        // above only touches goals Claude emitted by title; the anchor
        // goal won't appear there unless the user spoke its exact title.
        // Explicitly bump the anchor's lastMentionedAt + entryRefs so the
        // reflection always counts toward "last mentioned" and shows up
        // in the goal's linked-entries list. Mirror of the same block in
        // apps/web/src/lib/pipeline.ts.
        const entryRow = await tx.entry.findUnique({
          where: { id: entryId },
          select: { goalId: true },
        });
        if (entryRow?.goalId) {
          const anchor = await tx.goal.findFirst({
            where: { id: entryRow.goalId, userId },
            select: { id: true, entryRefs: true },
          });
          if (anchor) {
            const refs = Array.from(
              new Set([...(anchor.entryRefs ?? []), entryId])
            );
            await tx.goal.update({
              where: { id: anchor.id },
              data: { lastMentionedAt: new Date(), entryRefs: refs },
            });
          }
        }

        // GoalSuggestion emission — runs after goal upserts so a new
        // goal from this same entry is eligible as a parent. Orphan
        // suggestions (no fuzzy parent match) are dropped inside the
        // helper per spec.
        if (
          extraction.subGoalSuggestions &&
          extraction.subGoalSuggestions.length > 0
        ) {
          await persistSubGoalSuggestions(
            tx,
            userId,
            entryId,
            extraction.subGoalSuggestions
          );
        }

        // ProgressSuggestion emission — mirror of pipeline.ts. The
        // anchor goalId (if any) lives on the entry row, not in
        // scope here, so we read it alongside the rest of the
        // extraction context. When set, progress suggestions fall
        // back to matching the anchor if goalText didn't resolve.
        if (
          extraction.progressSuggestions &&
          extraction.progressSuggestions.length > 0
        ) {
          const anchorRow = await tx.entry.findUnique({
            where: { id: entryId },
            select: { goalId: true },
          });
          await persistProgressSuggestions(
            tx,
            userId,
            entryId,
            anchorRow?.goalId ?? null,
            extraction.progressSuggestions
          );
        }
      });
    });

    // Post-persist enrichment, parallelized. Four substeps —
    // link-calendar-events, extract-people, update-recording-stats,
    // embed-entry — are independent (different DB rows / different
    // external APIs, no shared mutation), each has its own
    // fail-soft handler, and none feed the next. Promise.all
    // collapses what was ~4 sequential round trips into one
    // max(latency) wait. Largest individual contributor is
    // embed-entry's OpenAI call (~1-3s); extract-people's Claude
    // Haiku NER is the next at ~2-5s for chatty transcripts. Net
    // savings on a typical entry: ~3-5s shaved off the post-persist
    // tail (2026-05-30 P0 win).
    //
    // Inngest semantics: `step.run()` returns a checkpoint-aware
    // Promise. Wrapping multiple in Promise.all preserves per-step
    // retry isolation — a failure in one substep doesn't re-run
    // the others on replay; each is its own retriable unit.
    //
    // update-user-memory + update-life-map (below this block) stay
    // sequential because both can downgrade Entry.status to PARTIAL,
    // and update-life-map's "only-if-currently-COMPLETE" guard is
    // race-sensitive. update-streak (further below) is left in its
    // original end-of-function slot — moving it here is correct
    // architecturally but the marginal gain is sub-second.
    await Promise.all([
      // Slice 3 v1.2 Calendar Integration — auto-link CalendarEvent
      // rows whose titles substring-match the persisted summary or
      // transcript. Conservative matcher (>=4 char title or first-
      // name match in 1-3 attendee meeting). Slice 6's manual link/
      // unlink UI handles the long tail. Fail-soft. No-op when
      // calendar isn't connected. Edit reprocess: preserve manual
      // link/unlink choices through the edit by skipping the
      // auto-linker entirely.
      calendarContext.events.length > 0 && !skipTranscribe
        ? step.run("link-calendar-events", async () => {
        try {
          const { inferLinkedEventIds } = await import("@/lib/calendar/context");
          const entry = await prisma.entry.findUnique({
            where: { id: entryId },
            select: { summary: true, transcript: true },
          });
          if (!entry) return;
          const text = `${entry.summary ?? ""}\n${entry.transcript ?? ""}`;
          const linkedEventIds = inferLinkedEventIds(text, calendarContext.events);
          if (linkedEventIds.length > 0) {
            await prisma.entry.update({
              where: { id: entryId },
              data: { linkedEventIds },
            });
          }
        } catch (err) {
          const { safeLog } = await import("@/lib/safe-log");
          safeLog.warn("process-entry.link-calendar-events-failed", {
            entryId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      })
        : Promise.resolve(),

      // Anchor People — Claude Haiku NER over the persisted transcript.
      // Slice 2 v1.2. Fail-soft per the embedding pattern; a missed
      // pass doesn't fail the entry, and the slice 7 backfill cron
      // catches misses. Idempotent on Entry.peopleExtractedAt IS NULL.
      // Skipped for FREE users — entitlement.canExtractEntries gates
      // the whole branch above so we only get here on PRO/TRIAL.
      step.run("extract-people", async () => {
      try {
        const entry = await prisma.entry.findUnique({
          where: { id: entryId },
          select: { transcript: true, peopleExtractedAt: true },
        });
        if (!entry?.transcript) return;
        // Idempotency: re-runs on a replay don't re-extract. The
        // backfill cron uses the same gate.
        if (entry.peopleExtractedAt) return;

        const { detectNamedPeople, locateMentions } = await import(
          "@/lib/people-ner"
        );
        const { resolveOrCreatePerson } = await import(
          "@/lib/people-resolver"
        );

        const candidates = await detectNamedPeople(entry.transcript);
        const mentions = locateMentions(entry.transcript, candidates);

        if (mentions.length > 0) {
          // Single load of the user's existing Persons — passed to the
          // resolver so each call doesn't re-query. The resolver pushes
          // newly-created rows into the array so later mentions in the
          // same batch resolve against them.
          const existing = await prisma.person.findMany({
            where: { userId },
            select: {
              id: true,
              canonicalName: true,
              displayName: true,
              aliases: true,
              mentionCount: true,
            },
          });

          // Track every Person id the resolver touches so the
          // reconcile pass below can recompute their counts. Catches
          // drift from the resolver's increment-on-create logic and
          // any P2002 race-recovery paths that bumped a sibling row.
          const touchedPersonIds = new Set<string>();
          for (const m of mentions) {
            try {
              const { personId } = await resolveOrCreatePerson(
                prisma,
                userId,
                m.mentionText,
                existing
              );
              touchedPersonIds.add(personId);
              await prisma.entityMention.create({
                data: {
                  entryId,
                  personId,
                  mentionText: m.mentionText,
                  startIndex: m.startIndex,
                  endIndex: m.endIndex,
                  context: m.context,
                },
              });
            } catch (err) {
              // Per-mention failures (resolver race, duplicate write
              // on retry) don't fail the whole batch.
              const { safeLog } = await import("@/lib/safe-log");
              safeLog.warn("process-entry.entity-mention-failed", {
                entryId,
                mention: m.mentionText.slice(0, 60),
                err: err instanceof Error ? err.message : String(err),
              });
            }
          }

          // Final reconciliation pass — only required on edit-driven
          // reprocesses. The PATCH endpoint already reconciled the
          // pre-edit affected Persons before this step ran; this
          // catches the post-edit set (new Persons + re-touched
          // existing ones). For brand-new entries the resolver's
          // increment is the source of truth and we skip this pass.
          if (skipTranscribe && touchedPersonIds.size > 0) {
            try {
              const { reconcilePersonCounts } = await import(
                "@/lib/people-reconcile"
              );
              await reconcilePersonCounts(prisma, touchedPersonIds);
            } catch (err) {
              const { safeLog } = await import("@/lib/safe-log");
              safeLog.warn("process-entry.people-reconcile-failed", {
                entryId,
                err: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }

        // Stamp idempotency even when zero mentions — we ran, we found
        // nothing, future replays should skip rather than re-Haiku.
        await prisma.entry.update({
          where: { id: entryId },
          data: { peopleExtractedAt: new Date() },
        });
      } catch (err) {
        const { safeLog } = await import("@/lib/safe-log");
        safeLog.warn("process-entry.extract-people-failed", {
          entryId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      }),

      // Recording stats — drives the trial onboarding orchestrator.
      // Runs right after the persist transaction so firstRecordingAt
      // lands before the next hour's trialEmailOrchestrator tick. We
      // only stamp on COMPLETE entries (not PARTIAL / FAILED), which
      // is the state a successful persist puts the row in. Fail-soft:
      // a stats update failure shouldn't fail the entry.
      step.run("update-recording-stats", async () => {
      const entry = await prisma.entry.findUnique({
        where: { id: entryId },
        select: { status: true, createdAt: true },
      });
      if (!entry || entry.status !== "COMPLETE") return;

      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstRecordingAt: true,
          createdAt: true,
          signupUtmSource: true,
          signupUtmCampaign: true,
          foundingMemberNumber: true,
        },
      });
      if (!existing) return;

      const isFirstRecording = existing.firstRecordingAt === null;

      await prisma.user.update({
        where: { id: userId },
        data: {
          firstRecordingAt: existing.firstRecordingAt ?? entry.createdAt,
          lastRecordingAt: entry.createdAt,
          totalRecordings: { increment: 1 },
        },
      });

      // Fire first_recording_completed PostHog event
      if (isFirstRecording) {
        try {
          const { track } = await import("@/lib/posthog");
          const hoursSinceSignup = Math.round(
            (entry.createdAt.getTime() - existing.createdAt.getTime()) /
              (1000 * 60 * 60)
          );
          await track(userId, "first_recording_completed", {
            hoursSinceSignup,
            signupUtmSource: existing.signupUtmSource,
            signupUtmCampaign: existing.signupUtmCampaign,
            foundingMemberNumber: existing.foundingMemberNumber,
          });
        } catch {
          // PostHog failure is non-fatal
        }
      }
      }).catch((err) => {
        logger.error(
          "[process-entry] update-recording-stats failed (non-fatal)",
          { err }
        );
      }),

      // Embedding generation — fail-soft. Runs outside the persist
      // transaction because OpenAI latency shouldn't block entry
      // persistence; a missed embedding just means this entry won't
      // show up in Ask-Your-Past-Self results until the backfill
      // script catches it.
      step.run("embed-entry", async () => {
      try {
        const { buildEmbedText, embedText } = await import("@/lib/embeddings");
        const entry = await prisma.entry.findUnique({
          where: { id: entryId },
          select: { summary: true, transcript: true },
        });
        if (!entry) return;
        const text = buildEmbedText(entry);
        if (!text) return;
        const vec = await embedText(text);
        await prisma.entry.update({
          where: { id: entryId },
          data: { embedding: vec },
        });
      } catch (err) {
        // safeLog routes through Sentry's transport; console.warn
        // does not. Embedding failures need observability so we can
        // diagnose the gap from prod logs (2026-05-02 TRIAL embed
        // gap was invisible until we re-instrumented this).
        const { safeLog } = await import("@/lib/safe-log");
        safeLog.warn("process-entry.embedding-failed", {
          entryId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      }),
    ]);

    // Steps 6 + 7: memory + lifemap enrichment. These fail-soft: a
    // downstream failure downgrades Entry to PARTIAL rather than FAILED
    // because the user's entry is already saved. A second entry from the
    // same user re-triggers memory/lifemap via the normal code path.
    let memoryOk = true;
    try {
      await step.run("update-user-memory", async () => {
        const entry = await prisma.entry.findUniqueOrThrow({
          where: { id: entryId },
          select: { id: true, entryDate: true, themes: true },
        });
        const { updateUserMemory } = await import("@/lib/memory");
        await updateUserMemory(userId, entry, extraction);
      });
    } catch (err) {
      memoryOk = false;
      logger.error("[process-entry] update-user-memory failed", { err });
      await prisma.entry.update({
        where: { id: entryId },
        data: { status: "PARTIAL", partialReason: "memory-update-failed" },
      });
    }

    let lifemapOk = true;
    try {
      await step.run("update-life-map", async () => {
        const { updateLifeMap } = await import("@/lib/memory");
        await updateLifeMap(userId, extraction.lifeAreaMentions);
      });
    } catch (err) {
      lifemapOk = false;
      logger.error("[process-entry] update-life-map failed", { err });
      const cur = await prisma.entry.findUniqueOrThrow({
        where: { id: entryId },
        select: { status: true, partialReason: true },
      });
      // Don't clobber a pre-existing partialReason ("memory-update-failed").
      if (cur.status === "COMPLETE") {
        await prisma.entry.update({
          where: { id: entryId },
          data: {
            status: "PARTIAL",
            partialReason: "lifemap-update-failed",
          },
        });
      }
    }

    // Step 8: streak update. Non-fatal — a streak failure shouldn't
    // downgrade the Entry. Worst case the user's streak sticks for a
    // day and recovers on the next successful entry.
    await step.run("update-streak", async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          timezone: true,
          lastSessionDate: true,
          currentStreak: true,
          longestStreak: true,
          lastStreakMilestone: true,
        },
      });
      if (!user) return;

      const { computeStreakUpdate } = await import("@/lib/streak");
      const now = new Date();
      const update = computeStreakUpdate({
        now,
        timezone: user.timezone || "America/Chicago",
        lastSessionDate: user.lastSessionDate,
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
        lastStreakMilestone: user.lastStreakMilestone,
      });

      await prisma.user.update({
        where: { id: userId },
        data: {
          lastSessionDate: now,
          currentStreak: update.currentStreak,
          longestStreak: update.longestStreak,
          lastStreakMilestone: update.milestoneHit
            ? update.milestoneHit
            : undefined,
        },
      });

      if (update.milestoneHit) {
        const { track } = await import("@/lib/posthog");
        await track(userId, "streak_milestone_hit", {
          milestone: update.milestoneHit,
          currentStreak: update.currentStreak,
        });
      }
    }).catch((err) => {
      logger.error("[process-entry] update-streak failed (non-fatal)", {
        err,
      });
    });

    // v1.3 achievements — evaluate after streak update so badges like
    // STREAK_DAYS see the freshly-incremented value. Non-fatal: a bad
    // trigger config or evaluator throw can't degrade the entry. The
    // evaluator's per-trigger try/catch handles individual failures;
    // this outer catch covers connection / Prisma-level explosions.
    await step
      .run("check-achievements", async () => {
        const { evaluateRealtime } = await import("@/lib/achievements");
        const awarded = await evaluateRealtime(prisma, { userId, entryId });
        if (awarded.length > 0) {
          logger.info("[process-entry] achievements awarded", {
            entryId,
            userId,
            awarded: awarded.map((a) => a.slug),
          });
        }
        return { awardedCount: awarded.length };
      })
      .catch((err) => {
        logger.error(
          "[process-entry] check-achievements failed (non-fatal)",
          { err }
        );
      });

    return {
      entryId,
      memoryOk,
      lifemapOk,
    };
  }
);
