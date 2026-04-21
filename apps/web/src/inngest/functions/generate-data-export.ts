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
 */

import JSZip from "jszip";

import { inngest } from "@/inngest/client";

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
      const audioFolder = zip.folder("audio");
      const entriesWithAudio = entries.filter(
        (e) => !!e.audioPath
      );
      if (entriesWithAudio.length > 0 && audioFolder) {
        const { supabase } = await import("@/lib/supabase.server");
        for (const e of entriesWithAudio) {
          if (!e.audioPath) continue;
          try {
            const { data, error } = await supabase.storage
              .from("voice-entries")
              .download(e.audioPath);
            if (error || !data) {
              logger.warn(
                `[data-export] audio download failed for entry ${e.id}: ${error?.message ?? "null data"}`
              );
              continue;
            }
            const buf = Buffer.from(await data.arrayBuffer());
            // Filename: <entryDate>-<entryId>.<ext>
            const dateStr = e.entryDate.toISOString().slice(0, 10);
            const extMatch = e.audioPath.match(/\.(\w+)$/);
            const ext = extMatch ? extMatch[1] : "webm";
            audioFolder.file(`${dateStr}-${e.id}.${ext}`, buf);
          } catch (err) {
            logger.warn(`[data-export] audio fetch failed: ${String(err)}`);
          }
        }
      } else if (audioFolder) {
        // Transcript-only entries: drop a README explaining the policy.
        audioFolder.file(
          "README.txt",
          `Acuity processes audio to produce a transcript and then deletes the original recording unless you configured retention otherwise. If any .m4a / .webm files were still on disk, they're included in this folder. Entries without audio were either processed before the file was persisted or had the audio removed per our retention policy.\n`
        );
      }

      // ── Top-level README ───────────────────────────────────────
      zip.file(
        "README.txt",
        [
          `Acuity data export — ${new Date().toISOString()}`,
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
          `  life-audits.json       — flagship audits (Day 14, quarterly, annual)`,
          `  user-insights.json     — auto-flagged observations`,
          `  audio/                 — original recordings when retained (.m4a / .webm)`,
          ``,
          `Retention: this link expires in 24 hours. If it expires before you download,`,
          `request a new export from Account → Download my data. One export per 7 days.`,
        ].join("\n")
      );

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      // ── Upload + sign ──────────────────────────────────────────
      const { supabase } = await import("@/lib/supabase.server");
      const path = `${userId}/${exportId}.zip`;
      const { error: uploadError } = await supabase.storage
        .from(EXPORT_BUCKET)
        .upload(path, zipBuffer, {
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

      return { ok: true, bytes: zipBuffer.length };
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
    }
  }
);
