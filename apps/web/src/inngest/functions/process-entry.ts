import { NonRetriableError } from "inngest";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

import { WHISPER_LANGUAGE, WHISPER_MODEL } from "@acuity/shared";

import { inngest } from "@/inngest/client";
import {
  extensionForMimeType,
  mimeTypeFromAudioPath,
} from "@/lib/audio";

type ProcessEntryEventData = {
  entryId: string;
  userId: string;
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
    const { entryId, userId } = event.data as ProcessEntryEventData;
    const { prisma } = await import("@/lib/prisma");
    const { supabase } = await import("@/lib/supabase.server");

    // Step 0: link the Entry to this Inngest run (for observability).
    await step.run("record-run-id", async () => {
      await prisma.entry.update({
        where: { id: entryId },
        data: { inngestRunId: runId },
      });
    });

    // Step 1: download audio from Supabase Storage.
    const { audioBase64, mimeType } = await step.run(
      "download-audio",
      async () => {
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
        return {
          audioBase64: buffer.toString("base64"),
          mimeType: mimeTypeFromAudioPath(entry.audioPath),
        };
      }
    );

    // Step 2: transcribe via Whisper + persist transcript immediately.
    // Persisting here (vs. buffering until the final transaction) means
    // an extract/persist failure later leaves a recoverable PARTIAL
    // entry with the user's words intact.
    await step.run("transcribe-and-persist-transcript", async () => {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const buffer = Buffer.from(audioBase64, "base64");
      // Derive filename from the canonical MIME rather than the
      // storage path. Pre-2026-04-20-afternoon entries were stored as
      // `userId/entryId.mp4`; Whisper's MP4 demuxer trips on those
      // (looks for a video track). extensionForMimeType maps
      // audio/mp4 → "m4a" so we always hand Whisper a filename
      // matching the actual container format.
      const filename = `recording.${extensionForMimeType(mimeType)}`;
      const file = await toFile(buffer, filename, { type: mimeType });

      const res = await openai.audio.transcriptions.create({
        file,
        model: WHISPER_MODEL,
        language: WHISPER_LANGUAGE,
        response_format: "text",
      });
      const transcript = (res as unknown as string).trim();

      if (transcript.length < 10) {
        throw new NonRetriableError(
          "Transcript too short — no speech detected"
        );
      }

      await prisma.entry.update({
        where: { id: entryId },
        data: { transcript, status: "EXTRACTING" },
      });
    });

    // Step 3: build memory context (Prisma read; sub-second).
    const memoryContext = await step.run("build-memory-context", async () => {
      const { buildMemoryContext } = await import("@/lib/memory");
      return buildMemoryContext(userId);
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
        entry.dimensionContext ?? null
      );
    });

    // Step 5: persist extraction + create Tasks/Goals in one transaction.
    await step.run("persist-extraction", async () => {
      await prisma.entry.update({
        where: { id: entryId },
        data: { status: "PERSISTING" },
      });

      const { recordThemesFromExtraction } = await import("@/lib/themes");
      const { persistSubGoalSuggestions } = await import("@/lib/goals");
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

        if (extraction.tasks.length > 0) {
          // Resolve Claude-assigned groupName → TaskGroup.id for this
          // user. Missing / unknown names fall back to the "Other" id.
          const userGroups = await tx.taskGroup.findMany({
            where: { userId },
            select: { id: true, name: true },
          });
          const groupIdByName = new Map<string, string>();
          for (const g of userGroups) {
            groupIdByName.set(g.name.toLowerCase(), g.id);
          }
          const otherGroupId = groupIdByName.get("other") ?? null;

          await tx.task.createMany({
            data: extraction.tasks.map((t) => {
              const resolved = t.groupName
                ? groupIdByName.get(t.groupName.trim().toLowerCase())
                : undefined;
              return {
                userId,
                entryId,
                text: t.title,
                title: t.title,
                description: t.description ?? null,
                priority: t.priority,
                dueDate: t.dueDate ? new Date(t.dueDate) : null,
                groupId: resolved ?? otherGroupId,
              };
            }),
          });
        }

        for (const g of extraction.goals) {
          const existing = await tx.goal.findFirst({
            where: {
              userId,
              title: { equals: g.title, mode: "insensitive" },
            },
          });
          if (!existing) {
            await tx.goal.create({
              data: {
                userId,
                title: g.title,
                description: g.description ?? null,
                targetDate: g.targetDate ? new Date(g.targetDate) : null,
                lastMentionedAt: new Date(),
                entryRefs: [entryId],
              },
            });
          } else {
            // Re-mention of an existing goal. Always bump lastMentionedAt +
            // append this entryId. Respect editedByUser: we never clobber a
            // user-authored title/description/status, but lastMentionedAt
            // is observational metadata so it always updates.
            const refs = Array.from(new Set([...(existing.entryRefs ?? []), entryId]));
            await tx.goal.update({
              where: { id: existing.id },
              data: {
                lastMentionedAt: new Date(),
                entryRefs: refs,
                // Only refill description if the user hasn't edited.
                ...(!existing.editedByUser && g.description
                  ? { description: g.description }
                  : {}),
              },
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
      });
    });

    // Embedding generation — fail-soft. Runs outside the transaction
    // because OpenAI latency shouldn't block entry persistence; a
    // missed embedding just means this entry won't show up in
    // Ask-Your-Past-Self results until the backfill script catches it.
    await step.run("embed-entry", async () => {
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
        console.warn("[process-entry] embedding failed (non-fatal):", err);
      }
    });

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

    return {
      entryId,
      memoryOk,
      lifemapOk,
    };
  }
);
