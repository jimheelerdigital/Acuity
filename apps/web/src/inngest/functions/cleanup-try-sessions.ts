/**
 * Inngest cron: clean up expired, unclaimed TrySession records.
 *
 * Runs every 5 minutes. Deletes:
 *   1. TrySession rows where expiresAt < now AND claimed = false
 *   2. Associated audio files from the voice-entries-try Supabase bucket
 *
 * Does NOT touch claimed sessions — those are already converted to real
 * Entries and their audio was moved to the user's folder during claim.
 */

import { inngest } from "@/inngest/client";

const TRY_STORAGE_BUCKET = "voice-entries-try";

export const cleanupTrySessionsFn = inngest.createFunction(
  {
    id: "cleanup-try-sessions",
    name: "Cleanup — Expired Try Sessions",
    triggers: [{ cron: "*/5 * * * *" }],
    retries: 1,
  },
  async ({ logger }) => {
    const { prisma } = await import("@/lib/prisma");

    const expired = await prisma.trySession.findMany({
      where: {
        expiresAt: { lt: new Date() },
        claimed: false,
      },
      select: {
        id: true,
        audioPath: true,
      },
      take: 100, // batch to avoid timeout
    });

    if (expired.length === 0) {
      logger.info("[cleanup-try-sessions] No expired sessions");
      return { deleted: 0 };
    }

    // Delete audio files from Supabase Storage
    const { supabase } = await import("@/lib/supabase.server");
    const paths = expired.map((s: { audioPath: string }) => s.audioPath).filter(Boolean);
    if (paths.length > 0) {
      const { error } = await supabase.storage
        .from(TRY_STORAGE_BUCKET)
        .remove(paths);
      if (error) {
        logger.warn("[cleanup-try-sessions] Audio delete error:", { error });
      }
    }

    // Delete the TrySession rows
    const result = await prisma.trySession.deleteMany({
      where: {
        id: { in: expired.map((s: { id: string }) => s.id) },
      },
    });

    logger.info("[cleanup-try-sessions] Cleaned up expired sessions", { count: result.count });
    return { deleted: result.count };
  }
);
