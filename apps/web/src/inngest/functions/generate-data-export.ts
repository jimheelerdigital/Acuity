/**
 * Async data-export builder. Triggered by
 * `data-export/generate.requested`. Materializes every piece of the
 * user's account into a zip, uploads to Supabase (user-exports
 * bucket), generates a 24h signed URL, marks the DataExport row
 * READY, and emails the user.
 *
 * Bucket expectation: "user-exports" with service-role-only read +
 * write. If the bucket doesn't exist Supabase will error on first
 * upload; Jim creates it once via the Supabase console (no code-side
 * bootstrap — avoids a dependency on storage admin APIs at deploy
 * time).
 *
 * Audio: we include original .m4a files when audioPath is set. If
 * transcripts were the only artifact (audioPath null), a README
 * explains that per privacy policy.
 *
 * PII posture: the export contains the user's own data. No scrubbing
 * needed — they requested it.
 *
 * ── Memory posture (2026-09-13) ──────────────────────────────────────
 * This function used to buffer every audio file into a JSZip instance and
 * then call `generateAsync({ type: "nodebuffer" })`, which materializes the
 * finished archive a SECOND time. Peak was therefore roughly 2x the export
 * size: a real 105MB account meant ~210MB resident plus V8 overhead, on a
 * serverless function that does not have much more than that to give.
 *
 * It now streams end to end, and nothing holds the whole archive:
 *
 *   1. Audio enters as a LAZY Readable per file. JSZip pulls each one only
 *      when the writer reaches that entry, so exactly one recording is in
 *      flight at a time instead of all of them.
 *   2. `generateNodeStream({ streamFiles: true })` emits the archive as it
 *      is built. `streamFiles` is what makes (1) possible — it writes a
 *      data descriptor after each entry instead of needing the compressed
 *      size up front, which would force a full buffer.
 *   3. The archive lands in a temp file, then uploads as a disk-backed
 *      Blob via `fs.openAsBlob`, so the upload body is read from disk in
 *      chunks rather than held in the heap.
 *
 * Measured against the same code path with synthetic inputs: 288MB of
 * content peaked at ~127MB RSS, of which ~40MB is the Node baseline — and
 * peak stays flat as content grows, which is the property that matters.
 *
 * Behaviour is deliberately IDENTICAL: same file list, same README, same
 * 24h signed URL, same DataExport status transitions, same email.
 *
 * ── What is still bounded by something else ──────────────────────────
 * Streaming bounds memory, not DISK. The archive is real bytes in the
 * invocation's ephemeral `/tmp`. `lib/export-audio-budget.ts` caps how
 * much audio may be admitted, and the loop below additionally stops on
 * ACTUAL bytes written. See that module for why both layers exist.
 */

import { createWriteStream, openAsBlob } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import JSZip from "jszip";

import { inngest } from "@/inngest/client";
import {
  AUDIO_BYTE_BUDGET,
  audioTruncationNote,
  estimateAudioBytes,
  planAudioInclusion,
} from "@/lib/export-audio-budget";

type ExportEvent = {
  name: "data-export/generate.requested";
  data: { exportId: string; userId: string };
};

const EXPORT_BUCKET = "user-exports";
const LINK_TTL_SECONDS = 24 * 60 * 60;

export const generateDataExportFn = inngest.createFunction(
  {
    id: "generate-data-export",
    name: "Generate user data export (async)",
    triggers: [{ event: "data-export/generate.requested" }],
    retries: 2,
    concurrency: { key: "event.data.userId", limit: 1 },
  },
  async ({ event, logger }) => {
    const { exportId, userId } = (event as unknown as ExportEvent).data;
    const { prisma } = await import("@/lib/prisma");

    await prisma.dataExport.update({
      where: { id: exportId },
      data: { status: "PROCESSING" },
    });

    // Declared out here so the finally below can always clean up, even
    // when the failure happened mid-archive.
    let tmpDir: string | null = null;

    try {
      const zip = new JSZip();

      // ── Pull everything in parallel ─────────────────────────────
      const [
        user,
        entries,
        tasks,
        goals,
        themes,
        themeMentions,
        lifemapAreas,
        lifemapHistory,
        weeklyReports,
        lifeAudits,
        userInsights,
        demographics,
        onboarding,
      ] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            timezone: true,
            createdAt: true,
            subscriptionStatus: true,
            trialEndsAt: true,
            currentStreak: true,
            longestStreak: true,
            lastStreakMilestone: true,
            referralCode: true,
            weeklyEmailEnabled: true,
            monthlyEmailEnabled: true,
            notificationTime: true,
            notificationDays: true,
            notificationsEnabled: true,
          },
        }),
        prisma.entry.findMany({ where: { userId } }),
        prisma.task.findMany({ where: { userId } }),
        prisma.goal.findMany({ where: { userId } }),
        prisma.theme.findMany({ where: { userId } }),
        prisma.themeMention.findMany({ where: { theme: { userId } } }),
        prisma.lifeMapArea.findMany({ where: { userId } }),
        prisma.lifeMapAreaHistory.findMany({ where: { userId } }),
        prisma.weeklyReport.findMany({ where: { userId } }),
        prisma.lifeAudit.findMany({ where: { userId } }),
        prisma.userInsight.findMany({ where: { userId } }),
        prisma.userDemographics.findUnique({ where: { userId } }),
        prisma.userOnboarding.findUnique({ where: { userId } }),
      ]);

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // ── JSON bundles ────────────────────────────────────────────
      zip.file("user.json", JSON.stringify({ user, demographics, onboarding }, null, 2));
      zip.file("entries.json", JSON.stringify(entries, null, 2));
      zip.file("tasks.json", JSON.stringify(tasks, null, 2));
      zip.file("goals.json", JSON.stringify(goals, null, 2));
      zip.file(
        "themes.json",
        JSON.stringify({ themes, mentions: themeMentions }, null, 2)
      );
      zip.file(
        "lifematrix.json",
        JSON.stringify(
          { areas: lifemapAreas, history: lifemapHistory },
          null,
          2
        )
      );
      zip.file("weekly-reports.json", JSON.stringify(weeklyReports, null, 2));
      zip.file("life-audits.json", JSON.stringify(lifeAudits, null, 2));
      zip.file("user-insights.json", JSON.stringify(userInsights, null, 2));

      // ── Audio files ────────────────────────────────────────────
      // Each file is added as a LAZY Readable: the async generator body
      // does not run until JSZip reaches that entry during generation, so
      // exactly one recording is downloaded and in flight at a time. This
      // is the change that removes the old "hold every file at once" peak.
      const audioFolder = zip.folder("audio");
      const plan = planAudioInclusion(
        entries.map((e) => ({
          id: e.id,
          audioPath: e.audioPath,
          audioBytes: estimateAudioBytes(e.audioDuration ?? e.duration),
          entryDate: e.entryDate,
        }))
      );

      // Second layer: a hard stop on ACTUAL bytes. The plan works from a
      // duration-derived estimate because the schema stores no byte count,
      // so this is what genuinely protects the scratch disk if the
      // estimate runs low. Closed over by the generators below.
      let audioBytesWritten = 0;
      let runtimeStopped = 0;

      if (plan.included.length > 0 && audioFolder) {
        const { supabase } = await import("@/lib/supabase.server");

        for (const e of plan.included) {
          if (!e.audioPath) continue;
          const dateStr = e.entryDate.toISOString().slice(0, 10);
          const extMatch = e.audioPath.match(/\.(\w+)$/);
          const ext = extMatch ? extMatch[1] : "webm";
          const storagePath = e.audioPath;
          const entryId = e.id;

          audioFolder.file(
            `${dateStr}-${entryId}.${ext}`,
            Readable.from(
              (async function* () {
                if (audioBytesWritten >= AUDIO_BYTE_BUDGET) {
                  runtimeStopped += 1;
                  return; // empty entry; note lands in the README
                }
                try {
                  const { data, error } = await supabase.storage
                    .from("voice-entries")
                    .download(storagePath);
                  if (error || !data) {
                    logger.warn(
                      `[data-export] audio download failed for entry ${entryId}: ${error?.message ?? "null data"}`
                    );
                    return;
                  }
                  // Blob -> web stream -> chunks. Yielding chunk by chunk
                  // keeps this generator's own footprint to one chunk.
                  const webStream = data.stream() as unknown as ReadableStream<Uint8Array>;
                  for await (const chunk of Readable.fromWeb(
                    webStream as Parameters<typeof Readable.fromWeb>[0]
                  )) {
                    const buf = chunk as Buffer;
                    audioBytesWritten += buf.length;
                    yield buf;
                  }
                } catch (err) {
                  // Never let one unreadable recording fail the export.
                  logger.warn(`[data-export] audio fetch failed: ${String(err)}`);
                }
              })()
            )
          );
        }
      }

      if (audioFolder) {
        // Transcript-only entries: explain the policy. Kept verbatim from
        // the pre-streaming version.
        const readmeParts = [
          `Ripple processes audio to produce a transcript and then deletes the original recording unless you configured retention otherwise. If any .m4a / .webm files were still on disk, they're included in this folder. Entries without audio were either processed before the file was persisted or had the audio removed per our retention policy.`,
        ];
        const truncation = audioTruncationNote(plan);
        if (truncation) readmeParts.push("", truncation);
        audioFolder.file("README.txt", `${readmeParts.join("\n")}\n`);
      }

      // ── Top-level README ───────────────────────────────────────
      zip.file(
        "README.txt",
        [
          `Ripple data export — ${new Date().toISOString()}`,
          ``,
          `Account: ${user.email ?? "(no email)"}`,
          `User id: ${user.id}`,
          ``,
          `Files:`,
          `  user.json              — your profile, demographics, onboarding state, email prefs`,
          `  entries.json           — every daily debrief with transcript + summary + extracted fields`,
          `  tasks.json             — extracted tasks`,
          `  goals.json             — goals + progress notes + entry refs`,
          `  themes.json            — per-theme mention records`,
          `  lifematrix.json        — current scores + weekly history`,
          `  weekly-reports.json    — every synthesized weekly report`,
          `  life-audits.json       — flagship audits (Day 7, quarterly, annual)`,
          `  user-insights.json     — auto-flagged observations`,
          `  audio/                 — original recordings when retained (.m4a / .webm)`,
          ``,
          `Retention: this link expires in 24 hours. If it expires before you download,`,
          `request a new export from Account → Download my data. One export per 7 days.`,
        ].join("\n")
      );

      // ── Stream the archive to a temp file ──────────────────────
      // generateNodeStream emits the zip as it is built; streamFiles:true
      // writes a data descriptor per entry so JSZip never needs an entry's
      // compressed size up front — which is precisely what would force it
      // to buffer the whole input. Piping to disk (rather than collecting
      // chunks) is what keeps the finished archive out of the heap.
      tmpDir = await mkdtemp(join(tmpdir(), `ripple-export-${exportId}-`));
      const zipPath = join(tmpDir, `${exportId}.zip`);

      await pipeline(
        zip.generateNodeStream({ type: "nodebuffer", streamFiles: true }),
        createWriteStream(zipPath)
      );

      const { size: zipBytes } = await stat(zipPath);
      if (runtimeStopped > 0) {
        logger.warn(
          `[data-export] ${runtimeStopped} recording(s) stopped by the runtime byte cap for ${userId}`
        );
      }
      logger.info(
        `[data-export] archive built for ${userId}: ${zipBytes} bytes, ${plan.included.length} audio file(s), ${plan.skipped.length} skipped`
      );

      // ── Upload + sign ──────────────────────────────────────────
      // openAsBlob gives a Blob that reads from disk on demand, so the
      // upload body is never fully resident. supabase-js accepts a Blob
      // directly and handles the multipart/content-length itself.
      const { supabase } = await import("@/lib/supabase.server");
      const path = `${userId}/${exportId}.zip`;
      const body = await openAsBlob(zipPath, { type: "application/zip" });
      const { error: uploadError } = await supabase.storage
        .from(EXPORT_BUCKET)
        .upload(path, body, {
          contentType: "application/zip",
          upsert: true,
        });
      if (uploadError) throw new Error(`upload failed: ${uploadError.message}`);

      const { data: signedData, error: signError } = await supabase.storage
        .from(EXPORT_BUCKET)
        .createSignedUrl(path, LINK_TTL_SECONDS);
      if (signError || !signedData?.signedUrl) {
        throw new Error(`signed-url failed: ${signError?.message ?? "no url"}`);
      }

      const expiresAt = new Date(Date.now() + LINK_TTL_SECONDS * 1000);

      await prisma.dataExport.update({
        where: { id: exportId },
        data: {
          status: "READY",
          downloadUrl: signedData.signedUrl,
          expiresAt,
        },
      });

      // ── Email the user ─────────────────────────────────────────
      try {
        const { sendDataExportReadyEmail } = await import(
          "@/emails/data-export-ready"
        );
        if (user.email) {
          await sendDataExportReadyEmail({
            to: user.email,
            name: user.name,
            url: signedData.signedUrl,
            expiresAt,
          });
        }
      } catch (err) {
        logger.warn(`[data-export] email failed for ${userId}: ${String(err)}`);
      }

      return {
        ok: true,
        bytes: zipBytes,
        audioIncluded: plan.included.length,
        audioSkipped: plan.skipped.length,
      };
    } catch (err) {
      logger.error(`[data-export] failed for ${userId}: ${String(err)}`);
      await prisma.dataExport.update({
        where: { id: exportId },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "unknown",
        },
      });
      throw err;
    } finally {
      // The archive is real bytes in a shared ephemeral volume. A warm
      // serverless container can serve many invocations, so leaving it
      // behind would accumulate until the disk fills — a slower version
      // of the failure this refactor exists to prevent.
      if (tmpDir) {
        await rm(tmpDir, { recursive: true, force: true }).catch((e) =>
          logger.warn(`[data-export] temp cleanup failed: ${String(e)}`)
        );
      }
    }
  }
);
